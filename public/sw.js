// ============================================================
// Service Worker — Google Drive Video Proxy
// ============================================================
const PROXY_PREFIX = '/api/drive-proxy/';
const THUMBNAIL_PROXY_PREFIX = '/api/drive-thumbnail/';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const AUTH_CACHE_NAME = 'nimbus-player-auth';
const TOKEN_CACHE_KEY = '/__nimbus-player-access-token';
const TOKEN_CACHE_TTL_MS = 50 * 60 * 1000;
const SHELL_CACHE_NAME = 'nimbus-player-shell-v1';
const STREAM_CACHE_NAME = 'nimbus-player-stream-v1';
const STREAM_CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_STREAM_CACHE_ENTRIES = 30;
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/play-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon-180.png',
  '/icons/apple-touch-icon-167.png',
  '/icons/apple-touch-icon-152.png',
  '/privacy.html',
  '/terms.html',
  '/support.html',
  '/developer.html',
];
const CURRENT_CACHE_NAMES = new Set([
  AUTH_CACHE_NAME,
  SHELL_CACHE_NAME,
  STREAM_CACHE_NAME,
]);

// Token storage (received from main thread)
let accessToken = null;
let accessTokenExpiresAt = 0;

async function readCachedToken() {
  const cache = await caches.open(AUTH_CACHE_NAME);
  const response = await cache.match(TOKEN_CACHE_KEY);
  if (!response) return null;

  const expiresAt = Number(response.headers.get('X-Nimbus-Token-Expires-At') || '0');
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await cache.delete(TOKEN_CACHE_KEY);
    await clearStreamCache();
    accessToken = null;
    accessTokenExpiresAt = 0;
    return null;
  }

  accessTokenExpiresAt = expiresAt;
  return response.text();
}

async function writeCachedToken(token) {
  const previousToken = accessToken || await readCachedToken();
  if (previousToken && previousToken !== token) {
    await clearStreamCache();
  }

  accessToken = token;
  accessTokenExpiresAt = Date.now() + TOKEN_CACHE_TTL_MS;
  const cache = await caches.open(AUTH_CACHE_NAME);
  await cache.put(TOKEN_CACHE_KEY, new Response(token, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
      'X-Nimbus-Token-Expires-At': String(accessTokenExpiresAt),
    },
  }));
}

async function clearCachedToken() {
  accessToken = null;
  accessTokenExpiresAt = 0;
  const cache = await caches.open(AUTH_CACHE_NAME);
  await cache.delete(TOKEN_CACHE_KEY);
  await clearStreamCache();
}

async function getAccessToken() {
  if (accessToken && accessTokenExpiresAt > Date.now()) return accessToken;
  accessToken = null;
  accessTokenExpiresAt = 0;
  accessToken = await readCachedToken();
  return accessToken;
}

function parseTotalSize(totalSize) {
  if (!totalSize) return null;

  const size = Number(totalSize);
  return Number.isSafeInteger(size) && size > 0 ? size : null;
}

function normalizeRangeHeader(rangeHeader, totalSize) {
  const size = parseTotalSize(totalSize);
  if (!rangeHeader || !size) {
    return {
      requestHeader: rangeHeader,
      start: null,
    };
  }

  const rangeMatch = rangeHeader.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!rangeMatch) {
    return {
      requestHeader: rangeHeader,
      start: null,
    };
  }

  const [, startValue, endValue] = rangeMatch;

  if (!startValue && endValue) {
    const suffixLength = Math.min(Number(endValue), size, STREAM_CHUNK_SIZE);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return {
        requestHeader: rangeHeader,
        start: null,
      };
    }

    const start = size - suffixLength;
    const end = size - 1;
    return {
      requestHeader: `bytes=${start}-${end}`,
      start,
    };
  }

  const start = Number(startValue);
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) {
    return {
      requestHeader: rangeHeader,
      start: null,
    };
  }

  const maxChunkEnd = start + STREAM_CHUNK_SIZE - 1;
  const requestedEnd = endValue ? Number(endValue) : maxChunkEnd;
  const end = Math.min(requestedEnd, maxChunkEnd, size - 1);
  if (!Number.isSafeInteger(end) || end < start) {
    return {
      requestHeader: rangeHeader,
      start: null,
    };
  }

  return {
    requestHeader: `bytes=${start}-${end}`,
    start,
  };
}

async function clearStreamCache() {
  await caches.delete(STREAM_CACHE_NAME);
}

function canCacheStreamRange(normalizedRange) {
  return normalizedRange.start === 0 && Boolean(normalizedRange.requestHeader);
}

function buildStreamCacheKey(fileId, totalSize, rangeHeader, resourceKey) {
  const cacheUrl = new URL(`/__nimbus-player-stream/${fileId}`, self.location.origin);
  cacheUrl.searchParams.set('size', totalSize || '');
  cacheUrl.searchParams.set('range', rangeHeader);
  cacheUrl.searchParams.set('resourcekey', resourceKey || '');
  return new Request(cacheUrl.toString());
}

function responseFromCachedStream(cachedResponse) {
  return new Response(cachedResponse.body, {
    status: 206,
    headers: cachedResponse.headers,
  });
}

async function trimStreamCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_STREAM_CACHE_ENTRIES) return;

  await Promise.all(
    keys.slice(0, keys.length - MAX_STREAM_CACHE_ENTRIES).map((key) => cache.delete(key))
  );
}

// Listen for token updates from main thread
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_TOKEN') {
    event.waitUntil?.(writeCachedToken(event.data.token));
  }
  if (event.data?.type === 'CLEAR_TOKEN') {
    event.waitUntil?.(clearCachedToken());
  }
});

async function cacheAppShell() {
  const cache = await caches.open(SHELL_CACHE_NAME);
  await Promise.all(
    SHELL_ASSETS.map((asset) => cache.add(asset).catch(() => undefined))
  );
}

function shouldHandleShellRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith(PROXY_PREFIX)) return false;
  if (url.pathname.startsWith(THUMBNAIL_PROXY_PREFIX)) return false;
  if (url.pathname.startsWith('/api/')) return false;

  return (
    request.mode === 'navigate' ||
    SHELL_ASSETS.includes(url.pathname) ||
    url.pathname.startsWith('/assets/')
  );
}

async function handleNavigationRequest(request) {
  const cache = await caches.open(SHELL_CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok && request.url === self.location.origin + '/') {
      try {
        await cache.put('/', response.clone());
      } catch {
        // Shell caching is opportunistic.
      }
    }
    return response;
  } catch {
    return (
      await cache.match(request) ||
      await cache.match('/index.html') ||
      await cache.match('/') ||
      new Response('Nimbus Player dang ngoai tuyen.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    );
  }
}

async function handleShellAssetRequest(request) {
  const cache = await caches.open(SHELL_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const networkResponsePromise = fetch(request).then(async (response) => {
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch {
        // Runtime asset caching is opportunistic.
      }
    }
    return response;
  });

  return cachedResponse || networkResponsePromise.catch(() => Response.error());
}

// Intercept fetch requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith(THUMBNAIL_PROXY_PREFIX)) {
    event.respondWith(handleThumbnailRequest(url));
    return;
  }

  if (!url.pathname.startsWith(PROXY_PREFIX)) {
    if (shouldHandleShellRequest(event.request, url)) {
      event.respondWith(
        event.request.mode === 'navigate'
          ? handleNavigationRequest(event.request)
          : handleShellAssetRequest(event.request)
      );
    }
    return;
  }

  event.respondWith(handleProxyRequest(event.request, url, event));
});

async function handleThumbnailRequest(url) {
  const token = await getAccessToken();

  if (!token) {
    return new Response('Chưa xác thực. Vui lòng đăng nhập.', {
      status: 401,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const fileId = url.pathname.replace(THUMBNAIL_PROXY_PREFIX, '').split('/')[0];

  if (!fileId) {
    return new Response('Thiếu File ID.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const resourceKey = url.searchParams.get('resourcekey') || url.searchParams.get('resourceKey');
  const metadataUrl = new URL(`${DRIVE_API_BASE}/${fileId}`);
  metadataUrl.searchParams.set('fields', 'thumbnailLink');
  metadataUrl.searchParams.set('supportsAllDrives', 'true');
  if (resourceKey) metadataUrl.searchParams.set('resourceKey', resourceKey);

  try {
    const metadataHeaders = { Authorization: `Bearer ${token}` };
    if (resourceKey) {
      metadataHeaders['X-Goog-Drive-Resource-Keys'] = `${fileId}/${resourceKey}`;
    }
    const metadataResponse = await fetch(metadataUrl.toString(), {
      headers: metadataHeaders,
    });

    if (!metadataResponse.ok) {
      if (metadataResponse.status === 401 || metadataResponse.status === 403) {
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'TOKEN_EXPIRED' });
          });
        });
      }

      return new Response('Không thể tải metadata thumbnail.', {
        status: metadataResponse.status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const metadata = await metadataResponse.json();
    if (!metadata.thumbnailLink) {
      return new Response('Video không có thumbnail.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // Redirect to the pre-signed thumbnailLink URL.  Letting the browser
    // follow the redirect avoids CORS issues that arise when the SW
    // fetch()-es lh3.googleusercontent.com (the CDN rejects the
    // Authorization header and can rate-limit with 429).
    return Response.redirect(metadata.thumbnailLink, 302);
  } catch (err) {
    console.error('>>> [SW] Thumbnail fetch error:', err);
    return new Response('Không thể tải thumbnail từ Google Drive.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function handleProxyRequest(request, url, event) {
  const token = await getAccessToken();

  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Chưa xác thực. Vui lòng đăng nhập.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Extract file ID from path: /api/drive-proxy/{fileId}
  const fileId = url.pathname.replace(PROXY_PREFIX, '').split('/')[0];

  if (!fileId) {
    return new Response(
      JSON.stringify({ error: 'Thiếu File ID.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Total file size passed from the app (needed to construct Content-Range
  // because Google Drive CORS does NOT expose Content-Range header)
  const totalSize = url.searchParams.get('size');
  const resourceKey = url.searchParams.get('resourcekey') || url.searchParams.get('resourceKey');

  // acknowledgeAbuse=true is needed for large files or files flagged by virus scan
  const driveUrl = new URL(`${DRIVE_API_BASE}/${fileId}`);
  driveUrl.searchParams.set('alt', 'media');
  driveUrl.searchParams.set('supportsAllDrives', 'true');
  driveUrl.searchParams.set('acknowledgeAbuse', 'true');
  if (resourceKey) driveUrl.searchParams.set('resourceKey', resourceKey);

  // Build headers — pass through Range header for seeking
  const fetchHeaders = new Headers({
    Authorization: `Bearer ${token}`,
  });

  // Required for accessing files shared via links with resource keys
  if (resourceKey) {
    fetchHeaders.set('X-Goog-Drive-Resource-Keys', `${fileId}/${resourceKey}`);
  }

  const rangeHeader = request.headers.get('Range');
  const normalizedRange = normalizeRangeHeader(rangeHeader, totalSize);
  if (normalizedRange.requestHeader) {
    fetchHeaders.set('Range', normalizedRange.requestHeader);
  }

  const streamCacheKey = canCacheStreamRange(normalizedRange)
    ? buildStreamCacheKey(fileId, totalSize, normalizedRange.requestHeader, resourceKey)
    : null;

  if (streamCacheKey) {
    const cache = await caches.open(STREAM_CACHE_NAME);
    const cachedResponse = await cache.match(streamCacheKey);
    if (cachedResponse) return responseFromCachedStream(cachedResponse);
  }

  try {
    const response = await fetch(driveUrl.toString(), {
      method: 'GET',
      headers: fetchHeaders,
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error(`>>> [SW] Drive API error: ${response.status} for file ${fileId}`);

      if (response.status === 401 || response.status === 403) {
        const errorBody = await response.text();
        console.error('>>> [SW] Auth error body:', errorBody);
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'TOKEN_EXPIRED' });
          });
        });
        return new Response(errorBody, {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const errorBody = await response.text();
      console.error('>>> [SW] Error body:', errorBody);
      return new Response(errorBody, {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Read headers from Google's response
    const contentType = response.headers.get('Content-Type');
    const contentLength = response.headers.get('Content-Length');
    // These are null due to Google Drive CORS not exposing them
    const contentRange = response.headers.get('Content-Range');

    // Build response headers
    const responseHeaders = new Headers();
    if (contentType) responseHeaders.set('Content-Type', contentType);
    // Always advertise that we support byte-range requests
    responseHeaders.set('Accept-Ranges', 'bytes');
    // Allow cross-origin access
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    let status = response.status;

    if (status === 206) {
      if (contentRange) {
        // Google exposed Content-Range (handle it)
        responseHeaders.set('Content-Range', contentRange);
        if (contentLength) responseHeaders.set('Content-Length', contentLength);
      } else if (normalizedRange.start !== null && totalSize && contentLength) {
        // Construct Content-Range from Range request + Content-Length + totalSize
        const length = parseInt(contentLength);
        if (Number.isSafeInteger(length) && length > 0) {
          const start = normalizedRange.start;
          const end = start + length - 1;
          const constructedRange = `bytes ${start}-${end}/${totalSize}`;
          responseHeaders.set('Content-Range', constructedRange);
          responseHeaders.set('Content-Length', contentLength);

        } else {
          // Can't parse range — fallback to 200
          console.warn('>>> [SW] Could not parse Range header — converting to 200');
          status = 200;
        }
      } else {
        // No Content-Range and can't construct one — convert to 200
        console.warn('>>> [SW] Got 206 without Content-Range or totalSize — converting to 200');
        status = 200;
      }
    } else {
      // 200 response — set Content-Length if available
      if (contentLength) responseHeaders.set('Content-Length', contentLength);
    }

    const proxyResponse = new Response(response.body, {
      status,
      headers: responseHeaders,
    });

    if (streamCacheKey && status === 206) {
      event.waitUntil?.((async () => {
        try {
          const cache = await caches.open(STREAM_CACHE_NAME);
          const cacheableResponse = new Response(proxyResponse.clone().body, {
            status: 200,
            headers: new Headers(responseHeaders),
          });
          await cache.put(streamCacheKey, cacheableResponse);
          await trimStreamCache(cache);
        } catch {
          // First-chunk cache is opportunistic.
        }
      })());
    }

    return proxyResponse;
  } catch (err) {
    console.error('>>> [SW] Fetch error:', err);
    return new Response(
      JSON.stringify({ error: 'Không thể tải dữ liệu từ Google Drive.', details: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Install - cache the basic PWA shell and activate immediately.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await cacheAppShell();
    await self.skipWaiting();
  })());
});

// Activate - clean old app caches and claim all clients.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map((cacheName) => {
        if (cacheName.startsWith('nimbus-player-') && !CURRENT_CACHE_NAMES.has(cacheName)) {
          return caches.delete(cacheName);
        }

        return undefined;
      })
    );
    await self.clients.claim();
  })());
});
