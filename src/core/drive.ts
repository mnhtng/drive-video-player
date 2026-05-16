// ============================================================
// Google Drive API Module
// File metadata, listing, and URL utilities
// ============================================================
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_CACHE_TTL_MS = 2 * 60 * 1000;
const SUBTITLE_TEXT_CACHE_TTL_MS = 5 * 60 * 1000;
const STREAM_PREFETCH_RANGE_HEADER = 'bytes=0-';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  videoMediaMetadata?: {
    width: number;
    height: number;
    durationMillis: string;
  };
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
}

export interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}

const DEFAULT_FILE_FIELDS = 'id,name,mimeType,size,thumbnailLink,videoMediaMetadata,createdTime,modifiedTime,parents';

interface TimedCacheEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
}

const metadataCache = new Map<string, TimedCacheEntry<DriveFile | null>>();
const folderVideosCache = new Map<string, TimedCacheEntry<DriveFileList | null>>();
const folderSubtitlesCache = new Map<string, TimedCacheEntry<DriveFileList | null>>();
const subtitleTextCache = new Map<string, TimedCacheEntry<string | null>>();
const folderInfoCache = new Map<string, TimedCacheEntry<{ id: string; name: string } | null>>();
const streamPrefetchPromises = new Map<string, Promise<void>>();

function buildTokenCacheKey(token: string, key: string): string {
  return `${token}:${key}`;
}

function getCachedPromise<T>(
  cache: Map<string, TimedCacheEntry<T>>,
  key: string,
  ttlMs: number,
  factory: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.promise;
  }

  const promise = factory()
    .then((value) => {
      if (value === null) {
        cache.delete(key);
      }
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, {
    expiresAt: now + ttlMs,
    promise,
  });

  return promise;
}

export function clearDriveCaches(): void {
  metadataCache.clear();
  folderVideosCache.clear();
  folderSubtitlesCache.clear();
  subtitleTextCache.clear();
  folderInfoCache.clear();
  streamPrefetchPromises.clear();
}

/**
 * Extract Google Drive file ID from various URL formats:
 * - https://drive.google.com/file/d/{fileId}/view
 * - https://drive.google.com/open?id={fileId}
 * - https://docs.google.com/file/d/{fileId}/edit
 * - https://drive.google.com/uc?id={fileId}&export=download
 * - Raw file ID string
 */
export function extractFileId(input: string): string | null {
  if (!input) return null;

  const trimmed = input.trim();

  // Already a raw file ID (alphanumeric + hyphens + underscores, typically 25-60 chars)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  // Try URL patterns
  try {
    const url = new URL(trimmed);

    // Pattern: /file/d/{fileId}/ or /d/{fileId}/
    const pathMatch = url.pathname.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];

    // Pattern: ?id={fileId}
    const idParam = url.searchParams.get('id');
    if (idParam) return idParam;
  } catch {
    return null;
  }

  return null;
}

/**
 * Build the Service Worker proxy URL for a file.
 * Pass fileSize so the SW can construct Content-Range headers
 * (Google Drive CORS doesn't expose Content-Range).
 */
export function buildProxyUrl(fileId: string, fileSize?: string): string {
  const base = `/api/drive-proxy/${fileId}`;
  return fileSize ? `${base}?size=${fileSize}` : base;
}

async function listFilesByQuery(
  query: string,
  token: string,
  fileFields = DEFAULT_FILE_FIELDS,
  pageSize = '100'
): Promise<DriveFileList | null> {
  const files: DriveFile[] = [];
  let nextPageToken: string | undefined;

  try {
    do {
      const params = new URLSearchParams({
        q: query,
        fields: `nextPageToken,files(${fileFields})`,
        orderBy: 'name',
        pageSize,
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });

      if (nextPageToken) params.set('pageToken', nextPageToken);

      const res = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return null;

      const page = await res.json() as DriveFileList;
      files.push(...(page.files ?? []));
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);

    return { files };
  } catch {
    return null;
  }
}

// -- API Calls --
export async function getFileMetadata(
  fileId: string,
  token: string
): Promise<DriveFile | null> {
  const fields = DEFAULT_FILE_FIELDS;
  const cacheKey = buildTokenCacheKey(token, `metadata:${fileId}`);

  return getCachedPromise(metadataCache, cacheKey, DRIVE_CACHE_TTL_MS, async () => {
    try {
      const res = await fetch(
        `${DRIVE_API_BASE}/files/${fileId}?fields=${fields}&supportsAllDrives=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        console.error('>>> [Drive] Failed to get file metadata:', res.status);
        return null;
      }

      return await res.json();
    } catch (err) {
      console.error('>>> [Drive] Error fetching metadata:', err);
      return null;
    }
  });
}

export async function listFolderVideos(
  folderId: string,
  token: string,
  pageToken?: string
): Promise<DriveFileList | null> {
  const query = `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`;
  const fields = 'id,name,mimeType,size,thumbnailLink,videoMediaMetadata,createdTime,modifiedTime,parents';

  if (!pageToken) {
    const cacheKey = buildTokenCacheKey(token, `folderVideos:${folderId}`);
    return getCachedPromise(folderVideosCache, cacheKey, DRIVE_CACHE_TTL_MS, () => {
      return listFilesByQuery(query, token, fields);
    });
  }

  try {
    const params = new URLSearchParams({
      q: query,
      fields: `nextPageToken,files(${fields})`,
      orderBy: 'name',
      pageSize: '50',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      pageToken,
    });

    const res = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function listFolderSubtitleFiles(
  folderId: string,
  token: string
): Promise<DriveFileList | null> {
  const query = [
    `'${folderId}' in parents`,
    'trashed = false',
    "(name contains '.vtt' or name contains '.VTT' or name contains '.srt' or name contains '.SRT')",
  ].join(' and ');

  const cacheKey = buildTokenCacheKey(token, `folderSubtitles:${folderId}`);
  return getCachedPromise(folderSubtitlesCache, cacheKey, DRIVE_CACHE_TTL_MS, () => {
    return listFilesByQuery(query, token, 'id,name,mimeType,size,modifiedTime,parents');
  });
}

export async function fetchDriveFileText(
  fileId: string,
  token: string
): Promise<string | null> {
  const cacheKey = buildTokenCacheKey(token, `text:${fileId}`);

  return getCachedPromise(subtitleTextCache, cacheKey, SUBTITLE_TEXT_CACHE_TTL_MS, async () => {
    try {
      const res = await fetch(
        `${DRIVE_API_BASE}/files/${fileId}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  });
}

export async function getFolderInfo(
  folderId: string,
  token: string
): Promise<{ id: string; name: string } | null> {
  const cacheKey = buildTokenCacheKey(token, `folderInfo:${folderId}`);

  return getCachedPromise(folderInfoCache, cacheKey, DRIVE_CACHE_TTL_MS, async () => {
    try {
      const res = await fetch(
        `${DRIVE_API_BASE}/files/${folderId}?fields=id,name&supportsAllDrives=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  });
}

export async function prefetchDriveVideo(fileOrId: DriveFile | string, token: string): Promise<void> {
  const metadata = typeof fileOrId === 'string'
    ? await getFileMetadata(fileOrId, token)
    : fileOrId;

  if (!metadata?.id || !metadata.size) return;

  const cacheKey = buildTokenCacheKey(token, `stream:${metadata.id}:${metadata.size}`);
  const existing = streamPrefetchPromises.get(cacheKey);
  if (existing) return existing;

  let succeeded = false;
  const promise = (async () => {
    const res = await fetch(buildProxyUrl(metadata.id, metadata.size), {
      headers: { Range: STREAM_PREFETCH_RANGE_HEADER },
    });

    if (!res.ok && res.status !== 206) return;

    await res.arrayBuffer();
    succeeded = true;
  })()
    .catch(() => {
      // Prefetch is opportunistic; playback should own user-visible errors.
    })
    .finally(() => {
      if (!succeeded) {
        streamPrefetchPromises.delete(cacheKey);
      }
    });

  streamPrefetchPromises.set(cacheKey, promise);
  return promise;
}
