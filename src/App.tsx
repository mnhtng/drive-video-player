import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, consumePendingFileId, consumePendingLocation } from '@/hooks/useAuth';
import { buildFolderUrl, buildPlayUrl, parseCurrentRoute, type ParsedRoute } from '@/core/router';
import HomeView from '@/components/HomeView';
import PlayerView from '@/components/PlayerView';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn } from 'lucide-react';
import { APP_NAME } from '@/core/constants';

function App() {
  const auth = useAuth();
  const [route, setRoute] = useState<ParsedRoute>({ action: 'home' });
  const pendingChecked = useRef(false);
  // Guard: once a pending play is scheduled, block any competing setRoute(home)
  const pendingPlayScheduled = useRef(false);

  const applyParsedRoute = useCallback((nextRoute: ParsedRoute) => {
    const { canonicalUrl, ...routeWithoutCanonical } = nextRoute;

    if (canonicalUrl) {
      const currentUrl = new URL(window.location.href);
      const nextUrl = new URL(canonicalUrl, window.location.origin);
      if (currentUrl.pathname !== nextUrl.pathname || currentUrl.search !== nextUrl.search) {
        window.history.replaceState({}, '', nextUrl.toString());
      }
    }

    setRoute(routeWithoutCanonical);
  }, []);

  const handlePlay = useCallback((fileId: string, resourceKey?: string) => {
    // Update URL without full reload
    const url = new URL(buildPlayUrl(fileId, resourceKey));
    window.history.pushState({}, '', url.toString());

    setRoute({ action: 'play', fileId, resourceKey });
  }, []);

  const handleBrowseFolder = useCallback((folderId: string) => {
    const url = new URL(buildFolderUrl(folderId));
    window.history.pushState({}, '', url.toString());
    pendingPlayScheduled.current = false;
    setRoute({ action: 'folder', folderId });
  }, []);

  const handleBack = useCallback(() => {
    const url = new URL(window.location.href);
    url.pathname = '/';
    url.search = '';
    window.history.pushState({}, '', url.toString());
    document.title = APP_NAME;
    pendingPlayScheduled.current = false;
    setRoute({ action: 'home' });
  }, []);

  // Parse route on mount + restore pending fileId after OAuth redirect
  useEffect(() => {
    if (auth.isLoading) return;

    // If authenticated and we haven't checked pending yet, try to restore
    if (auth.isAuthenticated && !pendingChecked.current) {
      pendingChecked.current = true;
      const pendingLocation = consumePendingLocation();
      const pendingFileId = consumePendingFileId();
      if (pendingLocation) {
        pendingPlayScheduled.current = true;
        window.history.replaceState({}, '', pendingLocation);
        window.setTimeout(() => {
          applyParsedRoute(parseCurrentRoute());
          pendingPlayScheduled.current = false;
        }, 0);
        return;
      }

      if (pendingFileId) {
        pendingPlayScheduled.current = true;
        window.setTimeout(() => {
          handlePlay(pendingFileId);
        }, 0);
        return;
      }
    }

    if (!auth.isAuthenticated) {
      pendingChecked.current = false;
    }

    // Only set route if no pending play is about to fire
    if (!pendingPlayScheduled.current) {
      window.setTimeout(() => {
        applyParsedRoute(parseCurrentRoute());
      }, 0);
    }
  }, [auth.isLoading, auth.isAuthenticated, applyParsedRoute, handlePlay]);

  // Listen for browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      applyParsedRoute(parseCurrentRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyParsedRoute]);

  // Loading screen
  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm">Đang khởi tạo...</p>
      </div>
    );
  }

  // Player view
  if (route.action === 'play' && route.fileId) {
    if (!auth.isAuthenticated || !auth.token) {
      const pendingLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border bg-card p-8 text-center shadow-sm">
            <button type="button" onClick={handleBack} className="flex items-center gap-3 cursor-pointer">
              <img src="/icons/play-icon.png" alt="Logo" className="size-10" />
              <span className="font-semibold">{APP_NAME}</span>
            </button>
            <h2 className="text-xl font-semibold">Đăng nhập để phát video</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Bạn cần đăng nhập Google để truy cập video từ Google Drive.
            </p>
            {auth.error ? (
              <p role="alert" className="text-sm leading-6 text-destructive">
                {auth.error}
              </p>
            ) : null}
            <Button
              onClick={() => auth.login(route.fileId, pendingLocation)}
              disabled={!auth.isConfigured}
              size="lg"
              className="mt-2"
            >
              <LogIn />
              Đăng nhập với Google
            </Button>
          </div>
        </div>
      );
    }

    return (
      <PlayerView
        fileId={route.fileId}
        resourceKey={route.resourceKey}
        token={auth.token}
        onBack={handleBack}
        onPlay={handlePlay}
      />
    );
  }

  // Home view
  return (
    <HomeView
      key={route.action === 'folder' ? `folder:${route.folderId}` : 'home'}
      user={auth.user}
      token={auth.token}
      isAuthenticated={auth.isAuthenticated}
      authConfigured={auth.isConfigured}
      authError={auth.error}
      onHome={handleBack}
      onLogin={auth.login}
      onLogout={auth.logout}
      onPlay={handlePlay}
      onBrowseFolder={handleBrowseFolder}
      folderId={route.action === 'folder' ? route.folderId : undefined}
      initialInput={route.action === 'home' ? route.sharedInput : undefined}
    />
  );
}

export default App;
