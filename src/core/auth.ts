// ============================================================
// Google OAuth2
// Token refresh is proxied through /api/token serverless function
// ============================================================
import type { TAuthConfig } from 'react-oauth2-code-pkce';

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
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    console.log('>>> [Auth] Service Worker registered:', registration.scope);

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
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI || window.location.origin;
const SCOPES = import.meta.env.VITE_GOOGLE_OAUTH_SCOPES;
const TOKEN_PROXY_URL = import.meta.env.VITE_TOKEN_PROXY_URL || '/api/token';

export function getAuthConfig(): TAuthConfig {
  return {
    clientId: CLIENT_ID,
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
    storageKeyPrefix: 'nimbus_player_',
    // When refresh token expires, prompt user to re-login
    onRefreshTokenExpire: (event) => {
      event.logIn();
    },
  };
}
