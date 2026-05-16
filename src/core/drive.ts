// ============================================================
// Google Drive API Module
// File metadata, listing, and URL utilities
// ============================================================
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

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
 * Build the Service Worker proxy URL for a file
 */
export function buildProxyUrl(fileId: string): string {
  return `/api/drive-proxy/${fileId}`;
}

// -- API Calls --
export async function getFileMetadata(
  fileId: string,
  token: string
): Promise<DriveFile | null> {
  const fields = 'id,name,mimeType,size,thumbnailLink,videoMediaMetadata,createdTime,modifiedTime,parents';

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
}

export async function listFolderVideos(
  folderId: string,
  token: string,
  pageToken?: string
): Promise<DriveFileList | null> {
  const query = `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`;
  const fields = 'nextPageToken,files(id,name,mimeType,size,thumbnailLink,videoMediaMetadata,createdTime,modifiedTime)';

  const params = new URLSearchParams({
    q: query,
    fields,
    orderBy: 'name',
    pageSize: '50',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });

  if (pageToken) params.set('pageToken', pageToken);

  try {
    const res = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getFolderInfo(
  folderId: string,
  token: string
): Promise<{ id: string; name: string } | null> {
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
}
