import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, consumePendingFileId } from '@/hooks/useAuth';
import { parseCurrentRoute, type ParsedRoute } from '@/core/router';
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

  const handlePlay = useCallback((fileId: string) => {
    // Update URL without full reload
    const url = new URL(window.location.href);
    url.searchParams.set('id', fileId);
    window.history.pushState({}, '', url.toString());

    setRoute({ action: 'play', fileId });
  }, []);

  const handleBack = useCallback(() => {
    const url = new URL(window.location.href);
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
      const pendingFileId = consumePendingFileId();
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
        setRoute(parseCurrentRoute());
      }, 0);
    }
  }, [auth.isLoading, auth.isAuthenticated, handlePlay]);

  // Listen for browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseCurrentRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border bg-card p-8 text-center shadow-sm">
            <div className="flex items-center gap-3">
              <img src="/play-icon.png" alt="Logo" className="size-10" />
              <span className="font-semibold">{APP_NAME}</span>
            </div>
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
              onClick={() => auth.login(route.fileId)}
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

    return <PlayerView fileId={route.fileId} token={auth.token} onBack={handleBack} onPlay={handlePlay} />;
  }

  // Home view
  return (
    <HomeView
      user={auth.user}
      token={auth.token}
      isAuthenticated={auth.isAuthenticated}
      authConfigured={auth.isConfigured}
      authError={auth.error}
      onLogin={auth.login}
      onLogout={auth.logout}
      onPlay={handlePlay}
    />
  );
}

export default App;
