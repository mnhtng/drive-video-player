// ============================================================
// Google Drive API Module
// File metadata, listing, and URL utilities
// ============================================================
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_CACHE_TTL_MS = 2 * 60 * 1000;
const SUBTITLE_TEXT_CACHE_TTL_MS = 5 * 60 * 1000;
const STREAM_PREFETCH_RANGE_HEADER = 'bytes=0-262143';
export const DRIVE_BROWSER_VIDEO_LIMIT = 5;
export const DRIVE_BROWSER_FOLDER_VIDEO_LIMIT = 25;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  resourceKey?: string;
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

export interface DriveFileReference {
  fileId: string;
  resourceKey?: string;
}

const DEFAULT_FILE_FIELDS = 'id,name,mimeType,resourceKey,size,thumbnailLink,videoMediaMetadata,createdTime,modifiedTime,parents';
const FOLDER_VIDEO_FIELDS = 'id,name,mimeType,resourceKey,size,thumbnailLink,videoMediaMetadata,createdTime,modifiedTime,parents';

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
 * Extract Google Drive file ID and resource key from various URL formats:
 * - https://drive.google.com/file/d/{fileId}/view
 * - https://drive.google.com/open?id={fileId}
 * - https://docs.google.com/file/d/{fileId}/edit
 * - https://drive.google.com/uc?id={fileId}&export=download
 * - Raw file ID string
 */
export function extractDriveFileReference(input: string): DriveFileReference | null {
  if (!input) return null;

  const trimmed = input.trim();

  // Already a raw file ID (alphanumeric + hyphens + underscores, typically 25-60 chars)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return { fileId: trimmed };
  }

  // Try URL patterns
  try {
    const url = new URL(trimmed);
    const resourceKey = url.searchParams.get('resourcekey') || url.searchParams.get('resourceKey') || undefined;

    // Pattern: /file/d/{fileId}/ or /d/{fileId}/
    const pathMatch = url.pathname.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) return { fileId: pathMatch[1], resourceKey };

    // Pattern: ?id={fileId}
    const idParam = url.searchParams.get('id');
    if (idParam) return { fileId: idParam, resourceKey };
  } catch {
    return null;
  }

  return null;
}

export function extractFileId(input: string): string | null {
  return extractDriveFileReference(input)?.fileId ?? null;
}

export function extractFolderId(input: string): string | null {
  if (!input) return null;

  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    const folderMatch = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) return folderMatch[1];

    if (url.pathname.includes('/drive/')) {
      const idParam = url.searchParams.get('id');
      if (idParam) return idParam;
    }
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
export function buildProxyUrl(fileId: string, fileSize?: string, resourceKey?: string): string {
  const base = `/api/drive-proxy/${fileId}`;
  const params = new URLSearchParams();
  if (fileSize) params.set('size', fileSize);
  if (resourceKey) params.set('resourcekey', resourceKey);

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function buildThumbnailUrl(fileId: string, resourceKey?: string): string {
  const base = `/api/drive-thumbnail/${encodeURIComponent(fileId)}`;
  const params = new URLSearchParams();
  if (resourceKey) params.set('resourcekey', resourceKey);

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function tokenizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 8);
}

async function listFilesByQuery(
  query: string,
  token: string,
  fileFields = DEFAULT_FILE_FIELDS,
  pageSize = '100'
): Promise<DriveFileList | null> {
  // Single page fetch — avoids unbounded loop that blocks the thread
  // when folders contain hundreds of files.
  try {
    const params = new URLSearchParams({
      q: query,
      fields: `nextPageToken,files(${fileFields})`,
      orderBy: 'name',
      pageSize,
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
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

async function listFilesPageByQuery(
  query: string,
  token: string,
  options: {
    fileFields?: string;
    pageSize?: string;
    pageToken?: string;
    orderBy?: string;
  } = {}
): Promise<DriveFileList | null> {
  const {
    fileFields = DEFAULT_FILE_FIELDS,
    pageSize = '50',
    pageToken,
    orderBy = 'name',
  } = options;

  try {
    const params = new URLSearchParams({
      q: query,
      fields: `nextPageToken,files(${fileFields})`,
      orderBy,
      pageSize,
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });

    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function listAllFilesByQuery(
  query: string,
  token: string,
  options: {
    fileFields?: string;
    pageSize?: string;
    orderBy?: string;
  } = {}
): Promise<DriveFileList | null> {
  const files: DriveFile[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken: string | undefined;

  do {
    const fileResult = await listFilesPageByQuery(query, token, {
      ...options,
      pageToken,
    });

    if (!fileResult) return null;

    files.push(...(fileResult.files ?? []));
    pageToken = fileResult.nextPageToken;

    if (pageToken) {
      if (seenPageTokens.has(pageToken)) break;
      seenPageTokens.add(pageToken);
    }
  } while (pageToken);

  return { files };
}

// -- API Calls --
export async function getFileMetadata(
  fileId: string,
  token: string,
  resourceKey?: string
): Promise<DriveFile | null> {
  const fields = DEFAULT_FILE_FIELDS;
  const cacheKey = buildTokenCacheKey(token, `metadata:${fileId}:${resourceKey ?? ''}`);

  return getCachedPromise(metadataCache, cacheKey, DRIVE_CACHE_TTL_MS, async () => {
    try {
      const params = new URLSearchParams({
        fields,
        supportsAllDrives: 'true',
      });

      if (resourceKey) params.set('resourceKey', resourceKey);

      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (resourceKey) {
        headers['X-Goog-Drive-Resource-Keys'] = `${fileId}/${resourceKey}`;
      }

      const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?${params.toString()}`, {
        headers,
      });

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
  token: string
): Promise<DriveFileList | null> {
  const query = `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`;

  const cacheKey = buildTokenCacheKey(token, `folderVideos:${folderId}`);
  return getCachedPromise(folderVideosCache, cacheKey, DRIVE_CACHE_TTL_MS, () => {
    return listAllFilesByQuery(query, token, {
      fileFields: FOLDER_VIDEO_FIELDS,
      orderBy: 'name',
      pageSize: '1000',
    });
  });
}

export async function listFolderVideosPage(
  folderId: string,
  token: string,
  options: {
    pageToken?: string;
    pageSize?: number;
  } = {}
): Promise<DriveFileList | null> {
  const query = `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`;

  return listFilesPageByQuery(query, token, {
    fileFields: FOLDER_VIDEO_FIELDS,
    orderBy: 'name',
    pageSize: String(options.pageSize ?? DRIVE_BROWSER_FOLDER_VIDEO_LIMIT),
    pageToken: options.pageToken,
  });
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
    return listFilesByQuery(query, token, 'id,name,mimeType,resourceKey,size,modifiedTime,parents');
  });
}

export async function fetchDriveFileText(
  fileId: string,
  token: string,
  resourceKey?: string
): Promise<string | null> {
  const cacheKey = buildTokenCacheKey(token, `text:${fileId}:${resourceKey ?? ''}`);

  return getCachedPromise(subtitleTextCache, cacheKey, SUBTITLE_TEXT_CACHE_TTL_MS, async () => {
    try {
      const params = new URLSearchParams({
        alt: 'media',
        supportsAllDrives: 'true',
        acknowledgeAbuse: 'true',
      });

      if (resourceKey) params.set('resourceKey', resourceKey);

      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (resourceKey) {
        headers['X-Goog-Drive-Resource-Keys'] = `${fileId}/${resourceKey}`;
      }

      const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?${params.toString()}`, {
        headers,
      });

      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  });
}

export async function listDriveVideos(
  token: string
): Promise<DriveFileList | null> {
  return listFilesPageByQuery(
    "mimeType contains 'video/' and trashed = false",
    token,
    {
      orderBy: 'modifiedTime desc',
      pageSize: String(DRIVE_BROWSER_VIDEO_LIMIT),
    }
  );
}

export async function searchDriveVideos(
  query: string,
  token: string
): Promise<DriveFileList | null> {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return listDriveVideos(token);

  const nameClauses = tokens.map((token) => {
    return `name contains '${escapeDriveQueryValue(token)}'`;
  });

  const driveQuery = [
    "mimeType contains 'video/'",
    'trashed = false',
    ...nameClauses,
  ].join(' and ');

  return listFilesPageByQuery(driveQuery, token, {
    orderBy: 'modifiedTime desc',
    pageSize: String(DRIVE_BROWSER_VIDEO_LIMIT),
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

export async function prefetchDriveVideo(
  fileOrId: DriveFile | string,
  token: string,
  resourceKey?: string
): Promise<void> {
  const metadata = typeof fileOrId === 'string'
    ? await getFileMetadata(fileOrId, token, resourceKey)
    : fileOrId;

  if (!metadata?.id || !metadata.size) return;

  const resolvedResourceKey = resourceKey ?? metadata.resourceKey;
  const cacheKey = buildTokenCacheKey(token, `stream:${metadata.id}:${metadata.size}:${resolvedResourceKey ?? ''}`);
  const existing = streamPrefetchPromises.get(cacheKey);
  if (existing) return existing;

  let succeeded = false;
  const promise = (async () => {
    const res = await fetch(buildProxyUrl(metadata.id, metadata.size, resolvedResourceKey), {
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
