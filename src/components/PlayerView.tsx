import { useState, useEffect, useRef, type ChangeEvent, type PointerEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Captions,
  Loader2,
  Maximize,
  Moon,
  ListVideo,
  Play,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlayer } from '@/hooks/usePlayer';
import { formatFileSize, formatDuration } from '@/utils/string';
import { PlaylistPanel } from '@/components/PlaylistPanel';
import { buildThumbnailUrl } from '@/core/drive';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import 'plyr/dist/plyr.css';

interface PlayerViewProps {
  fileId: string;
  resourceKey?: string;
  token: string;
  onBack: () => void;
  onPlay: (fileId: string, resourceKey?: string) => void;
}

export default function PlayerView({ fileId, resourceKey, token, onBack, onPlay }: PlayerViewProps) {
  const [retryKey, setRetryKey] = useState(0);
  const {
    videoRef,
    player,
    fileMetadata,
    captionTracks,
    localCaptionTracks,
    qualitySources,
    isLoading,
    error,
    subtitleError,
    addLocalSubtitleFiles,
    clearLocalSubtitleTracks,
  } = usePlayer({
    fileId,
    token,
    resourceKey,
    reloadKey: retryKey,
  });

  const [isTheater, setIsTheater] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [sleepTimer, setSleepTimer] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(true);
  const [gestureFeedback, setGestureFeedback] = useState<{ label: string; x: number; y: number } | null>(null);
  const subtitleInputRef = useRef<HTMLInputElement | null>(null);
  const gestureFeedbackTimerRef = useRef<number | undefined>(undefined);
  const lastTouchGestureRef = useRef<{ time: number; zone: 'backward' | 'forward' } | null>(null);

  const parentFolderId = fileMetadata?.parents?.[0];
  const subtitleTrackCount = captionTracks.length + localCaptionTracks.length;
  const videoAspectRatio = fileMetadata?.videoMediaMetadata?.width && fileMetadata.videoMediaMetadata.height
    ? `${fileMetadata.videoMediaMetadata.width} / ${fileMetadata.videoMediaMetadata.height}`
    : '16 / 9';

  useEffect(() => {
    return () => {
      if (gestureFeedbackTimerRef.current) {
        window.clearTimeout(gestureFeedbackTimerRef.current);
      }
    };
  }, []);

  // Sleep timer logic
  useEffect(() => {
    if (sleepTimer === null) return;

    const timer = window.setTimeout(() => {
      if (sleepTimer <= 1) {
        if (player) player.pause();
        else if (videoRef.current) videoRef.current.pause();
        setSleepTimer(null);
        return;
      }

      setSleepTimer((s) => (s !== null ? s - 1 : null));
    }, 60000); // 1 minute

    return () => window.clearTimeout(timer);
  }, [sleepTimer, player, videoRef]);

  useEffect(() => {
    const syncPausedState = () => {
      setIsPaused(player ? player.paused : (videoRef.current?.paused ?? true));
    };

    if (player) {
      syncPausedState();
      player.on('play', syncPausedState);
      player.on('pause', syncPausedState);
      player.on('ended', syncPausedState);

      return () => {
        player.off('play', syncPausedState);
        player.off('pause', syncPausedState);
        player.off('ended', syncPausedState);
      };
    }

    const video = videoRef.current;
    if (!video) return;

    syncPausedState();
    video.addEventListener('play', syncPausedState);
    video.addEventListener('pause', syncPausedState);
    video.addEventListener('ended', syncPausedState);

    return () => {
      video.removeEventListener('play', syncPausedState);
      video.removeEventListener('pause', syncPausedState);
      video.removeEventListener('ended', syncPausedState);
    };
  }, [player, videoRef]);

  const handlePlay = () => {
    if (player) {
      Promise.resolve(player.play()).catch(() => videoRef.current?.play());
      return;
    }

    videoRef.current?.play();
  };

  const seekBy = (seconds: number) => {
    const media = videoRef.current;
    if (!media) return;

    const duration = Number.isFinite(media.duration) ? media.duration : media.currentTime + Math.abs(seconds);
    media.currentTime = Math.min(Math.max(media.currentTime + seconds, 0), duration);
  };

  const showGestureFeedback = (label: string, x: number, y: number) => {
    if (gestureFeedbackTimerRef.current) {
      window.clearTimeout(gestureFeedbackTimerRef.current);
    }

    setGestureFeedback({ label, x, y });
    gestureFeedbackTimerRef.current = window.setTimeout(() => {
      setGestureFeedback(null);
      gestureFeedbackTimerRef.current = undefined;
    }, 650);
  };

  const handleTouchGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || isLoading || error) return;

    const target = event.target as HTMLElement;
    if (target.closest('.plyr__controls, button, input, select, textarea, [role="menu"]')) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const zone = x < rect.width * 0.33
      ? 'backward'
      : x > rect.width * 0.67
        ? 'forward'
        : null;

    if (!zone) {
      lastTouchGestureRef.current = null;
      return;
    }

    const now = Date.now();
    const lastTouch = lastTouchGestureRef.current;
    const isDoubleTap = lastTouch?.zone === zone && now - lastTouch.time < 320;

    if (!isDoubleTap) {
      lastTouchGestureRef.current = { time: now, zone };
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    lastTouchGestureRef.current = null;

    if (zone === 'backward') {
      seekBy(-10);
      showGestureFeedback('-10s', x, y);
      return;
    }

    seekBy(10);
    showGestureFeedback('+10s', x, y);
  };

  const handleSubtitleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    await addLocalSubtitleFiles(files);
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <header className="grid min-h-16 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b bg-background/90 px-3 backdrop-blur-xl sm:px-5">
        <Button onClick={onBack} variant="ghost" size="sm" title="Quay về trang chủ">
          <ArrowLeft />
          <span className="hidden sm:inline">Quay lại</span>
        </Button>

        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between px-2">
          {fileMetadata && (
            <>
              <h1 className="min-w-0 truncate text-sm font-medium sm:text-base" title={fileMetadata.name}>
                {fileMetadata.name}
              </h1>
              <div className="flex shrink-0 flex-wrap items-center gap-2 hidden md:flex">
                {fileMetadata.size && (
                  <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {formatFileSize(fileMetadata.size)}
                  </span>
                )}
                {fileMetadata.videoMediaMetadata?.durationMillis && (
                  <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {formatDuration(fileMetadata.videoMediaMetadata.durationMillis)}
                  </span>
                )}
                {fileMetadata.videoMediaMetadata?.width && (
                  <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {fileMetadata.videoMediaMetadata.width}×{fileMetadata.videoMediaMetadata.height}
                  </span>
                )}
                {qualitySources.length > 1 && (
                  <span
                    className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground"
                    title={qualitySources.map((source) => `${source.label}: ${source.name}`).join('\n')}
                  >
                    Chất lượng {qualitySources.map((source) => source.label).join(' / ')}
                  </span>
                )}
                {captionTracks.length > 0 && (
                  <span
                    className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground"
                    title={captionTracks.map((track) => track.fileName).join('\n')}
                  >
                    CC {captionTracks.length}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <input
            ref={subtitleInputRef}
            type="file"
            accept=".srt,.vtt,text/vtt,application/x-subrip"
            multiple
            className="hidden"
            onChange={handleSubtitleUpload}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" title="Phụ đề">
                <Captions className="size-4" />
                {subtitleTrackCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                    {subtitleTrackCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Phụ đề</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  subtitleInputRef.current?.click();
                }}
              >
                <Upload className="size-4" />
                Tải .srt / .vtt
              </DropdownMenuItem>
              {localCaptionTracks.length > 0 && (
                <DropdownMenuItem onClick={clearLocalSubtitleTracks}>
                  <X className="size-4" />
                  Xóa phụ đề đã tải
                </DropdownMenuItem>
              )}
              {subtitleTrackCount > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                    {captionTracks.length > 0 ? `Drive: ${captionTracks.map((track) => track.label).join(', ')}` : null}
                    {captionTracks.length > 0 && localCaptionTracks.length > 0 ? ' · ' : null}
                    {localCaptionTracks.length > 0 ? `Local: ${localCaptionTracks.map((track) => track.label).join(', ')}` : null}
                  </DropdownMenuLabel>
                </>
              )}
              {subtitleError ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-medium leading-5 text-destructive">
                    {subtitleError}
                  </DropdownMenuLabel>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Moon className="size-4" />
                {sleepTimer !== null && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                    {sleepTimer}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Hẹn giờ ngủ</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSleepTimer(15)}>15 phút</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSleepTimer(30)}>30 phút</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSleepTimer(60)}>60 phút</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSleepTimer(120)}>120 phút</DropdownMenuItem>
              {sleepTimer !== null && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSleepTimer(null)} className="text-destructive">
                    Tắt hẹn giờ
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" onClick={() => setIsTheater(!isTheater)} title="Chế độ rạp">
            <Maximize className="size-4" />
          </Button>

          {parentFolderId && (
            <Button
              variant={showPlaylist ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => setShowPlaylist(!showPlaylist)}
              title="Danh sách phát"
            >
              <ListVideo className="size-4" />
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        <main
          className={[
            'relative flex flex-1 items-center justify-center bg-black transition-all duration-300',
            isTheater ? 'p-0' : 'p-2 sm:p-4 md:p-6',
          ].join(' ')}
        >
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm">Đang tải video...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
              <AlertCircle className="size-12 text-destructive" />
              <p className="text-lg font-semibold">Không thể phát video</p>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">{error}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => setRetryKey((value) => value + 1)} variant="secondary">
                  <RotateCcw />
                  Tải lại
                </Button>
                <Button onClick={onBack}>
                  Quay về trang chủ
                </Button>
              </div>
            </div>
          )}

          <div
            style={{ aspectRatio: isTheater ? undefined : videoAspectRatio }}
            onPointerUp={handleTouchGesture}
            className={[
              'relative w-full transition-all duration-300',
              isTheater ? 'h-full max-w-full [&_.plyr]:h-full [&_.plyr]:rounded-none' : 'max-h-full max-w-[1200px]',
              '[&_.plyr]:h-full [&_.plyr]:w-full [&_.plyr]:overflow-hidden [&_.plyr]:rounded-lg [&_.plyr]:border [&_.plyr]:border-border [&_.plyr]:bg-black [&_.plyr]:shadow-2xl',
              '[&_.plyr__video-wrapper]:h-full [&_video]:h-full [&_video]:w-full [&_video]:object-contain',
              error ? 'pointer-events-none opacity-0' : 'opacity-100',
            ].join(' ')}
          >
            <video
              ref={videoRef}
              crossOrigin="anonymous"
              preload="metadata"
              poster={fileMetadata?.thumbnailLink
                ? buildThumbnailUrl(fileMetadata.id, resourceKey ?? fileMetadata.resourceKey)
                : undefined}
              controls
              playsInline
            />
            {!isLoading && !error && isPaused && (
              <button
                type="button"
                onClick={handlePlay}
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 text-white transition hover:bg-black/20"
                aria-label="Phát video"
              >
                <span className="flex size-16 items-center justify-center rounded-full bg-black/65 text-white shadow-2xl ring-1 ring-white/20 backdrop-blur-sm">
                  <Play className="ml-1 size-8 fill-current" />
                </span>
              </button>
            )}
            {gestureFeedback && (
              <div
                className="pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white shadow-2xl ring-1 ring-white/20"
                style={{ left: gestureFeedback.x, top: gestureFeedback.y }}
              >
                {gestureFeedback.label}
              </div>
            )}
          </div>
        </main>

        {parentFolderId && showPlaylist && (
          <button
            type="button"
            className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setShowPlaylist(false)}
            aria-label="Đóng danh sách phát"
          />
        )}

        {parentFolderId && showPlaylist && (
          <aside
            className={[
              'fixed inset-y-0 right-0 z-30 flex h-[100dvh] w-[min(22rem,calc(100vw-1rem))] shrink-0 flex-col border-l bg-card shadow-2xl',
              'md:relative md:z-auto md:h-full md:w-80 md:shadow-none',
            ].join(' ')}
          >
            <PlaylistPanel
              folderId={parentFolderId}
              token={token}
              currentFileId={fileId}
              currentFile={fileMetadata}
              onSelect={onPlay}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
