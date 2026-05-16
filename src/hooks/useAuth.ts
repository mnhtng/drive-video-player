import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from 'react-oauth2-code-pkce';
import {
  syncTokenToServiceWorker,
  registerServiceWorker,
  fetchUserInfo,
  canFetchUserInfo,
  type UserInfo,
} from '@/core/auth';
import { PENDING_FILE_KEY } from '@/core/constants';

export interface AuthState {
  token: string | null;
  user: UserInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth() {
  const { token, logIn, logOut, loginInProgress, error: authError } = useAuthContext();

  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const swRegistered = useRef(false);
  const prevTokenRef = useRef<string | null>(null);
  const initialLoadDone = useRef(false);

  // Register Service Worker
  useEffect(() => {
    if (!swRegistered.current) {
      registerServiceWorker();
      swRegistered.current = true;
    }
  }, []);

  // Sync token to SW and fetch user info whenever token changes
  useEffect(() => {
    const currentToken = token || null;

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

      if (!canFetchUserInfo()) {
        queueMicrotask(() => {
          setUser(null);
          setIsLoading(false);
        });
        return;
      }

      // Fetch user info (async callback — not synchronous setState)
      fetchUserInfo(currentToken).then((userInfo) => {
        setUser(userInfo);
        setIsLoading(false);
      });
    } else {
      syncTokenToServiceWorker(null);
      // Use queueMicrotask to avoid synchronous setState in effect body
      queueMicrotask(() => {
        setUser(null);
        setIsLoading(false);
      });
    }
  }, [token, loginInProgress]);



  // Login wrapper: save pending fileId before redirect
  const handleLogin = useCallback((pendingFileId?: string) => {
    if (pendingFileId) {
      sessionStorage.setItem(PENDING_FILE_KEY, pendingFileId);
    }
    logIn();
  }, [logIn]);

  const handleLogout = useCallback(() => {
    logOut();
    syncTokenToServiceWorker(null);
    setUser(null);
  }, [logOut]);

  const isAuthenticated = !!token && !loginInProgress;

  return {
    token: token || null,
    user,
    isLoading: isLoading || loginInProgress,
    isAuthenticated,
    login: handleLogin,
    logout: handleLogout,
    error: authError,
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
