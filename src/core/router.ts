// ============================================================
// Handles: ?id=, ?url=, ?state= (Drive Open With)
// ============================================================
import { extractDriveFileReference } from '@/core/drive';

export type RouteAction = 'home' | 'play' | 'folder';

export interface ParsedRoute {
  action: RouteAction;
  fileId?: string;
  resourceKey?: string;
  folderId?: string;
  /** File IDs from Google Drive "Open With" state */
  fileIds?: string[];
  /** Resource keys from Google Drive "Open With" state, keyed by file ID */
  resourceKeys?: Record<string, string>;
}

interface DriveOpenState {
  action?: string;
  ids?: unknown;
  resourceKeys?: unknown;
}

function parseOpenState(state: string): DriveOpenState | null {
  const candidates = [state];

  try {
    const decoded = decodeURIComponent(state);
    if (decoded !== state) candidates.push(decoded);
  } catch {
    // URLSearchParams normally decodes for us; keep the original candidate.
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as DriveOpenState;
    } catch {
      // Try the next representation.
    }
  }

  return null;
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => {
      return typeof entry[0] === 'string' && typeof entry[1] === 'string' && entry[1].length > 0;
    });

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

/**
 * Parse the current URL to determine the action
 *
 * Supported URL patterns:
 * - /                           → home
 * - /play?id={fileId}           → play single file
 * - /play?url={driveUrl}        → parse URL, extract fileId, play
 * - /open?state={json}          → Google Drive "Open With" handler
 * - /folder?id={folderId}       → browse folder
 */
export function parseCurrentRoute(): ParsedRoute {
  const params = new URLSearchParams(window.location.search);
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';

  // Check for Google Drive "Open With" state parameter
  const state = params.get('state');
  if (state) {
    const parsed = parseOpenState(state);
    const ids = Array.isArray(parsed?.ids)
      ? parsed.ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];

    if (parsed?.action === 'open' && ids.length > 0) {
      const resourceKeys = normalizeStringRecord(parsed.resourceKeys);
      const firstFileId = ids[0];

      return {
        action: 'play',
        fileId: firstFileId,
        resourceKey: resourceKeys?.[firstFileId],
        fileIds: ids,
        resourceKeys,
      };
    }
  }

  // Check for folder
  if (pathname === '/folder') {
    const folderId = params.get('id') || params.get('folder');
    if (folderId) {
      return { action: 'folder', folderId };
    }
  }

  const folderPathMatch = pathname.match(/^\/folder\/([a-zA-Z0-9_-]+)$/);
  if (folderPathMatch) {
    return { action: 'folder', folderId: folderPathMatch[1] };
  }

  const folder = params.get('folder');
  if (folder) {
    return { action: 'folder', folderId: folder };
  }

  // Check for direct file ID
  const id = params.get('id');
  if (id) {
    return {
      action: 'play',
      fileId: id,
      resourceKey: params.get('resourcekey') || params.get('resourceKey') || undefined,
    };
  }

  const playPathMatch = pathname.match(/^\/play\/([a-zA-Z0-9_-]+)$/);
  if (playPathMatch) {
    return {
      action: 'play',
      fileId: playPathMatch[1],
      resourceKey: params.get('resourcekey') || params.get('resourceKey') || undefined,
    };
  }

  // Check for Drive URL
  const url = params.get('url');
  if (url) {
    const reference = extractDriveFileReference(url);
    if (reference) {
      return {
        action: 'play',
        fileId: reference.fileId,
        resourceKey: reference.resourceKey,
      };
    }
  }

  // Legacy support for /?state=, /?id= and /?folder= is intentionally kept above.
  return { action: 'home' };
}

/**
 * Build a canonical in-app play URL.
 */
export function buildPlayUrl(fileId: string, resourceKey?: string): string {
  const url = new URL('/play', window.location.origin);
  url.searchParams.set('id', fileId);
  if (resourceKey) url.searchParams.set('resourcekey', resourceKey);
  return url.toString();
}

/**
 * Build a canonical in-app folder URL.
 */
export function buildFolderUrl(folderId: string): string {
  const url = new URL('/folder', window.location.origin);
  url.searchParams.set('id', folderId);
  return url.toString();
}

/**
 * Navigate to play a file
 */
export function navigateToPlay(fileId: string, newTab = false, resourceKey?: string): void {
  const url = buildPlayUrl(fileId, resourceKey);
  if (newTab) {
    window.open(url, '_blank');
  } else {
    window.location.href = url;
  }
}

/**
 * Navigate to home
 */
export function navigateToHome(): void {
  window.location.href = window.location.origin;
}
