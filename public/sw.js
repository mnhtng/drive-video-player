// ============================================================
// Service Worker — Google Drive Video Proxy
// ============================================================
const PROXY_PREFIX = '/api/drive-proxy/';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

// Token storage (received from main thread)
let accessToken = null;

// Listen for token updates from main thread
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_TOKEN') {
    accessToken = event.data.token;
    console.log('>>> [SW] Token updated');
  }
  if (event.data?.type === 'CLEAR_TOKEN') {
    accessToken = null;
    console.log('>>> [SW] Token cleared');
  }
});

// Intercept fetch requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept our proxy requests
  if (!url.pathname.startsWith(PROXY_PREFIX)) return;

  event.respondWith(handleProxyRequest(event.request, url));
});

async function handleProxyRequest(request, url) {
  if (!accessToken) {
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

  const driveUrl = `${DRIVE_API_BASE}/${fileId}?alt=media`;

  // Build headers — pass through Range header for seeking
  const headers = new Headers({
    Authorization: `Bearer ${accessToken}`,
  });

  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    headers.set('Range', rangeHeader);
  }

  try {
    const response = await fetch(driveUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.log('>>> [SW] Token expired or invalid');
        // Notify main thread that token is invalid
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'TOKEN_EXPIRED' });
          });
        });
      }

      const errorBody = await response.text();
      return new Response(errorBody, {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build response headers
    const responseHeaders = new Headers();
    const contentType = response.headers.get('Content-Type');
    const contentLength = response.headers.get('Content-Length');
    const contentRange = response.headers.get('Content-Range');
    const acceptRanges = response.headers.get('Accept-Ranges');

    if (contentType) responseHeaders.set('Content-Type', contentType);
    if (contentLength) responseHeaders.set('Content-Length', contentLength);
    if (contentRange) responseHeaders.set('Content-Range', contentRange);
    if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);

    // Allow cross-origin access
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err) {
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
  console.log('>>> [SW] Activated and controlling all clients');
});
