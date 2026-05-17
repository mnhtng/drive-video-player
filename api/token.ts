// ============================================================
// Vercel Serverless Function — Google OAuth2 Token Proxy
// Handles: authorization_code → tokens, refresh_token → new access_token
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

const ALLOWED_ORIGINS = (process.env.TOKEN_ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);

function getCorsHeaders(origin: string | undefined) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  const cors = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).setHeader('Access-Control-Allow-Origin', cors['Access-Control-Allow-Origin'])
      .setHeader('Access-Control-Allow-Methods', cors['Access-Control-Allow-Methods'])
      .setHeader('Access-Control-Allow-Headers', cors['Access-Control-Allow-Headers'])
      .setHeader('Access-Control-Max-Age', cors['Access-Control-Max-Age'])
      .end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Phương thức request không được hỗ trợ.' });
  }

  // Set CORS headers for all responses
  Object.entries(cors).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  const { grant_type, code, redirect_uri, code_verifier, refresh_token } = req.body;

  if (!grant_type) {
    return res.status(400).json({ error: 'Thiếu grant_type.' });
  }

  // Build the request body for Google's token endpoint
  const tokenParams: Record<string, string> = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type,
  };

  if (grant_type === 'authorization_code') {
    // Initial token exchange: auth code → access_token + refresh_token
    if (!code || !redirect_uri) {
      return res.status(400).json({ error: 'Thiếu code hoặc redirect_uri cho authorization_code grant.' });
    }
    tokenParams.code = code;
    tokenParams.redirect_uri = redirect_uri;
    if (code_verifier) {
      tokenParams.code_verifier = code_verifier;
    }
  } else if (grant_type === 'refresh_token') {
    // Token refresh: refresh_token → new access_token
    if (!refresh_token) {
      return res.status(400).json({ error: 'Thiếu refresh_token.' });
    }
    tokenParams.refresh_token = refresh_token;
  } else {
    return res.status(400).json({ error: `grant_type không được hỗ trợ: ${grant_type}` });
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenParams).toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('>>> [Token Proxy] Google token error:', data);
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('>>> [Token Proxy] Fetch error:', err);
    return res.status(502).json({ error: 'Không thể kết nối tới Google OAuth server.' });
  }
}
