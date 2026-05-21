// ============================================================
// Google OAuth2
// Token refresh is proxied through /api/token serverless function
// ============================================================
import type { TAuthConfig } from 'react-oauth2-code-pkce';
import { STORAGE_KEY_PREFIX } from '@/core/constants';

export interface UserInfo {
  email: string;
  name: string;
  picture: string;
}

export async function fetchUserInfo(token: string): Promise<UserInfo | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;

    return await res.json();
  } catch {
    return null;
  }
}

export function syncTokenToServiceWorker(token: string | null): void {
  if (!('serviceWorker' in navigator)) return;

  const msg = token
    ? { type: 'SET_TOKEN' as const, token }
    : { type: 'CLEAR_TOKEN' as const };

  // If SW is already controlling, send directly
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(msg);
    return;
  }

  // SW registered but not yet controlling (first load) — wait for it
  navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage(msg);
  });
}

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.warn('>>> [Auth] Service Workers not supported');
    return;
  }

  try {
    await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // Listen for messages from SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'TOKEN_EXPIRED') {
        console.warn('>>> [Auth] Token expired signal from SW');
        window.dispatchEvent(new CustomEvent('auth:tokenExpired'));
      }
    });
  } catch (err) {
    console.error('>>> [Auth] Service Worker registration failed:', err);
  }
}

// -- Auth Config --
const DEFAULT_SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const MISSING_CLIENT_ID = 'missing-google-oauth-client-id';

function readEnvString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const CLIENT_ID = readEnvString(import.meta.env.VITE_GOOGLE_CLIENT_ID);
const REDIRECT_URI = readEnvString(import.meta.env.VITE_GOOGLE_REDIRECT_URI) || window.location.origin;
const SCOPES = readEnvString(import.meta.env.VITE_GOOGLE_OAUTH_SCOPES) || DEFAULT_SCOPES;
const TOKEN_PROXY_URL = readEnvString(import.meta.env.VITE_TOKEN_PROXY_URL) || '/api/token';

export function createOAuthState(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isAuthConfigured(): boolean {
  return CLIENT_ID.length > 0;
}

export function getAuthConfigurationError(): string | null {
  if (isAuthConfigured()) return null;

  return 'Google OAuth chưa được cấu hình cho môi trường triển khai này. Thiếu biến VITE_GOOGLE_CLIENT_ID trong Environment Variables.';
}

export function canFetchUserInfo(): boolean {
  return String(SCOPES || '')
    .split(/\s+/)
    .includes('openid');
}

export function getAuthConfig(): TAuthConfig {
  return {
    clientId: CLIENT_ID || MISSING_CLIENT_ID,
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    // Point to our proxy instead of Google directly
    // The proxy will attach client_secret securely
    tokenEndpoint: TOKEN_PROXY_URL,
    redirectUri: REDIRECT_URI,
    scope: SCOPES,
    extraAuthParameters: {
      // Request offline access to get refresh_token
      access_type: 'offline',
      // Force consent screen to always get refresh_token
      prompt: 'consent',
    },
    decodeToken: false,
    autoLogin: false,
    // Store tokens in localStorage so they survive page reloads
    storage: 'local',
    storageKeyPrefix: STORAGE_KEY_PREFIX,
    // When refresh token expires, prompt user to re-login
    onRefreshTokenExpire: (event) => {
      event.logIn(createOAuthState());
    },
  };
}
