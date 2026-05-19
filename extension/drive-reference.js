(() => {
  const DEFAULT_PLAYER_BASE_URL = 'https://nimbus-player.vercel.app';
  const DRIVE_FILE_ID_PATTERN = /^[a-zA-Z0-9_-]{20,}$/;
  const DRIVE_FILE_ID_CAPTURE = '([a-zA-Z0-9_-]{20,})';
  const VIDEO_EXTENSION_PATTERN = /\.(3g2|3gp|avi|flv|m2ts|m4v|mkv|mov|mp4|mpeg|mpg|mts|ogv|ts|webm|wmv)(?:$|[\s?#):;,])/i;

  function isDriveHost(hostname) {
    return hostname === 'drive.google.com' || hostname.endsWith('.drive.google.com');
  }

  function normalizeResourceKey(value) {
    if (!value || typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  function getFallbackBaseUrl() {
    if (typeof location !== 'undefined' && location.href) return location.href;
    return DEFAULT_PLAYER_BASE_URL;
  }

  function parseDriveReference(input) {
    if (!input || typeof input !== 'string') return null;

    const trimmed = input.trim();
    if (DRIVE_FILE_ID_PATTERN.test(trimmed)) {
      return { fileId: trimmed };
    }

    try {
      const url = new URL(trimmed, getFallbackBaseUrl());
      const resourceKey = normalizeResourceKey(
        url.searchParams.get('resourcekey') || url.searchParams.get('resourceKey')
      );

      const filePathMatch = url.pathname.match(new RegExp(`/+(?:file/+)?d/+${DRIVE_FILE_ID_CAPTURE}`));
      if (filePathMatch) {
        return {
          fileId: filePathMatch[1],
          resourceKey,
          sourceUrl: url.href,
        };
      }

      const idParam = url.searchParams.get('id');
      if (idParam && DRIVE_FILE_ID_PATTERN.test(idParam)) {
        return {
          fileId: idParam,
          resourceKey,
          sourceUrl: url.href,
        };
      }
    } catch {
      // Fall through to regex parsing for partially copied URLs.
    }

    const rawPathMatch = trimmed.match(new RegExp(`/(?:file/)?d/${DRIVE_FILE_ID_CAPTURE}`));
    if (rawPathMatch) {
      return {
        fileId: rawPathMatch[1],
        resourceKey: parseResourceKeyFromText(trimmed),
      };
    }

    const rawIdMatch = trimmed.match(new RegExp(`[?&]id=${DRIVE_FILE_ID_CAPTURE}`));
    if (rawIdMatch) {
      return {
        fileId: rawIdMatch[1],
        resourceKey: parseResourceKeyFromText(trimmed),
      };
    }

    return null;
  }

  function parseResourceKeyFromText(value) {
    const match = value.match(/[?&]resource[Kk]ey=([^&#\s]+)/);
    if (!match) return undefined;

    try {
      return normalizeResourceKey(decodeURIComponent(match[1]));
    } catch {
      return normalizeResourceKey(match[1]);
    }
  }

  function hasVideoExtension(value) {
    return Boolean(value && VIDEO_EXTENSION_PATTERN.test(value));
  }

  function normalizePlayerBaseUrl(input) {
    const trimmed = (input || DEFAULT_PLAYER_BASE_URL).trim();
    const url = new URL(trimmed);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('URL trình phát phải bắt đầu bằng http:// hoặc https://');
    }

    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');

    return url.toString().replace(/\/$/, '');
  }

  function buildPlayerUrl(baseUrl, fileId, resourceKey) {
    const url = new URL('play', `${normalizePlayerBaseUrl(baseUrl)}/`);
    url.searchParams.set('id', fileId);
    if (resourceKey) url.searchParams.set('resourcekey', resourceKey);
    return url.toString();
  }

  globalThis.NimbusDrive = Object.freeze({
    DEFAULT_PLAYER_BASE_URL,
    DRIVE_FILE_ID_PATTERN,
    buildPlayerUrl,
    hasVideoExtension,
    isDriveHost,
    normalizePlayerBaseUrl,
    parseDriveReference,
  });
})();
