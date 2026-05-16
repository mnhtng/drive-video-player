import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from 'react-oauth2-code-pkce';
import {
  syncTokenToServiceWorker,
  registerServiceWorker,
  fetchUserInfo,
  canFetchUserInfo,
  getAuthConfigurationError,
  isAuthConfigured,
  type UserInfo,
} from '@/core/auth';
import { clearDriveCaches } from '@/core/drive';
import { PENDING_FILE_KEY } from '@/core/constants';

export interface AuthState {
  token: string | null;
  user: UserInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isConfigured: boolean;
}

export function useAuth() {
  const { token, logIn, logOut, loginInProgress, error: authError } = useAuthContext();
  const authConfigured = isAuthConfigured();
  const authConfigurationError = getAuthConfigurationError();

  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const swRegistered = useRef(false);
  const prevTokenRef = useRef<string | null>(null);
  const initialLoadDone = useRef(false);

  // Register Service Worker
  useEffect(() => {
    if (!authConfigured) return;

    if (!swRegistered.current) {
      registerServiceWorker();
      swRegistered.current = true;
    }
  }, [authConfigured]);

  // Sync token to SW and fetch user info whenever token changes
  useEffect(() => {
    const currentToken = authConfigured ? token || null : null;

    if (!authConfigured) {
      syncTokenToServiceWorker(null);
      clearDriveCaches();
      queueMicrotask(() => {
        setUser(null);
        setIsLoading(false);
      });
      return;
    }

    // Skip if token hasn't actually changed
    if (currentToken === prevTokenRef.current) {
      // On initial load, if there's no token and login isn't in progress, stop loading
      if (!initialLoadDone.current && !loginInProgress && !currentToken) {
        initialLoadDone.current = true;
        setIsLoading(false);
      }
      return;
    }

    prevTokenRef.current = currentToken;
    initialLoadDone.current = true;

    if (currentToken) {
      // Sync token to Service Worker
      syncTokenToServiceWorker(currentToken);
      queueMicrotask(() => setIsLoading(false));

      if (!canFetchUserInfo()) {
        queueMicrotask(() => setUser(null));
        return;
      }

      // Fetch user info in the background; token availability should unblock routing.
      fetchUserInfo(currentToken).then((userInfo) => {
        if (prevTokenRef.current !== currentToken) return;
        setUser(userInfo);
      });
    } else {
      syncTokenToServiceWorker(null);
      clearDriveCaches();
      // Use queueMicrotask to avoid synchronous setState in effect body
      queueMicrotask(() => {
        setUser(null);
        setIsLoading(false);
      });
    }
  }, [authConfigured, token, loginInProgress]);

  // Login wrapper: save pending fileId before redirect
  const handleLogin = useCallback((pendingFileId?: string) => {
    if (!authConfigured) return;

    if (pendingFileId) {
      sessionStorage.setItem(PENDING_FILE_KEY, pendingFileId);
    }
    logIn();
  }, [authConfigured, logIn]);

  const handleLogout = useCallback(() => {
    if (authConfigured) {
      logOut();
    }

    syncTokenToServiceWorker(null);
    clearDriveCaches();
    setUser(null);
  }, [authConfigured, logOut]);

  const isAuthenticated = authConfigured && !!token && !loginInProgress;

  return {
    token: authConfigured ? token || null : null,
    user,
    isLoading: authConfigured ? isLoading || loginInProgress : false,
    isAuthenticated,
    isConfigured: authConfigured,
    login: handleLogin,
    logout: handleLogout,
    error: authConfigurationError || authError,
  };
}

/**
 * Retrieve and clear the pending file ID that was saved before OAuth redirect.
 * Call this once after login completes to restore the user's intended action.
 */
export function consumePendingFileId(): string | null {
  const fileId = sessionStorage.getItem(PENDING_FILE_KEY);
  if (fileId) {
    sessionStorage.removeItem(PENDING_FILE_KEY);
  }
  return fileId;
}
