// ============================================================
// Handles: ?id=, ?url=, ?state= (Drive Open With)
// ============================================================
import { extractFileId } from '@/core/drive';

export type RouteAction = 'home' | 'play' | 'folder';

export interface ParsedRoute {
  action: RouteAction;
  fileId?: string;
  folderId?: string;
  /** File IDs from Google Drive "Open With" state */
  fileIds?: string[];
}

/**
 * Parse the current URL to determine the action
 *
 * Supported URL patterns:
 * - /                           → home
 * - /?id={fileId}               → play single file
 * - /?url={driveUrl}            → parse URL, extract fileId, play
 * - /?state={json}              → Google Drive "Open With" handler
 * - /?folder={folderId}         → browse folder
 */
export function parseCurrentRoute(): ParsedRoute {
  const params = new URLSearchParams(window.location.search);

  // Check for Google Drive "Open With" state parameter
  const state = params.get('state');
  if (state) {
    try {
      const parsed = JSON.parse(state);
      if (parsed.action === 'open' && parsed.ids?.length > 0) {
        return {
          action: 'play',
          fileId: parsed.ids[0],
          fileIds: parsed.ids,
        };
      }
    } catch {
      console.warn('>>> [Router] Failed to parse state parameter');
    }
  }

  // Check for direct file ID
  const id = params.get('id');
  if (id) {
    return { action: 'play', fileId: id };
  }

  // Check for Drive URL
  const url = params.get('url');
  if (url) {
    const fileId = extractFileId(url);
    if (fileId) {
      return { action: 'play', fileId };
    }
  }

  // Check for folder
  const folder = params.get('folder');
  if (folder) {
    return { action: 'folder', folderId: folder };
  }

  return { action: 'home' };
}

/**
 * Navigate to play a file
 */
export function navigateToPlay(fileId: string, newTab = false): void {
  const url = `${window.location.origin}?id=${fileId}`;
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
