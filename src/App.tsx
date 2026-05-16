import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, consumePendingFileId } from '@/hooks/useAuth';
import { parseCurrentRoute, type ParsedRoute } from '@/core/router';
import HomeView from '@/components/HomeView';
import PlayerView from '@/components/PlayerView';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn } from 'lucide-react';

function App() {
  const auth = useAuth();
  const [route, setRoute] = useState<ParsedRoute>({ action: 'home' });
  const pendingChecked = useRef(false);

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
    document.title = 'Nimbus Player';
    setRoute({ action: 'home' });
  }, []);

  // Parse route on mount + restore pending fileId after OAuth redirect
  useEffect(() => {
    if (!auth.isLoading) {
      // First, check if there's a pending fileId from before OAuth redirect
      if (!pendingChecked.current && auth.isAuthenticated) {
        pendingChecked.current = true;
        const pendingFileId = consumePendingFileId();
        if (pendingFileId) {
          queueMicrotask(() => handlePlay(pendingFileId));
          return;
        }
      }
      pendingChecked.current = true;
      setRoute(parseCurrentRoute());
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
              <span className="font-semibold">Nimbus Player</span>
            </div>
            <h2 className="text-xl font-semibold">Đăng nhập để phát video</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Bạn cần đăng nhập Google để truy cập video từ Google Drive.
            </p>
            <Button onClick={() => auth.login(route.fileId)} size="lg" className="mt-2">
              <LogIn />
              Đăng nhập với Google
            </Button>
          </div>
        </div>
      );
    }

    return <PlayerView fileId={route.fileId} token={auth.token} onBack={handleBack} />;
  }

  // Home view
  return (
    <HomeView
      user={auth.user}
      isAuthenticated={auth.isAuthenticated}
      onLogin={auth.login}
      onLogout={auth.logout}
      onPlay={handlePlay}
    />
  );
}

export default App;
