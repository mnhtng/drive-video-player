// ============================================================
// Service Worker — Google Drive Video Proxy
// ============================================================
const PROXY_PREFIX = '/api/drive-proxy/';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const AUTH_CACHE_NAME = 'nimbus-player-auth';
const TOKEN_CACHE_KEY = '/__nimbus-player-access-token';
const STREAM_CACHE_NAME = 'nimbus-player-stream-v1';
const STREAM_CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_STREAM_CACHE_ENTRIES = 30;

// Token storage (received from main thread)
let accessToken = null;

async function readCachedToken() {
  const cache = await caches.open(AUTH_CACHE_NAME);
  const response = await cache.match(TOKEN_CACHE_KEY);
  if (!response) return null;
  return response.text();
}

async function writeCachedToken(token) {
  const previousToken = accessToken || await readCachedToken();
  if (previousToken && previousToken !== token) {
    await clearStreamCache();
  }

  accessToken = token;
  const cache = await caches.open(AUTH_CACHE_NAME);
  await cache.put(TOKEN_CACHE_KEY, new Response(token, {
    headers: { 'Content-Type': 'text/plain' },
  }));
}

async function clearCachedToken() {
  accessToken = null;
  const cache = await caches.open(AUTH_CACHE_NAME);
  await cache.delete(TOKEN_CACHE_KEY);
  await clearStreamCache();
}

async function getAccessToken() {
  if (accessToken) return accessToken;
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

// Intercept fetch requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept our proxy requests
  if (!url.pathname.startsWith(PROXY_PREFIX)) return;

  event.respondWith(handleProxyRequest(event.request, url, event));
});

async function handleProxyRequest(request, url, event) {
  const token = await getAccessToken();

  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Not authenticated. Please sign in.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Extract file ID from path: /api/drive-proxy/{fileId}
  const fileId = url.pathname.replace(PROXY_PREFIX, '').split('/')[0];

  if (!fileId) {
    return new Response(
      JSON.stringify({ error: 'Missing file ID' }),
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
      JSON.stringify({ error: 'Failed to fetch from Google Drive', details: err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Install — skip waiting to activate immediately
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate — claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
