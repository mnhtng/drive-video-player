import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlayer } from '@/hooks/usePlayer';
import { formatFileSize, formatDuration } from '@/utils/string';
import 'plyr/dist/plyr.css';

interface PlayerViewProps {
  fileId: string;
  token: string;
  onBack: () => void;
}

export default function PlayerView({ fileId, token, onBack }: PlayerViewProps) {
  const { videoRef, fileMetadata, isLoading, error } = usePlayer({
    fileId,
    token,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b bg-background/90 px-3 backdrop-blur-xl sm:px-5">
        <Button onClick={onBack} variant="ghost" size="sm" title="Quay về trang chủ">
          <ArrowLeft />
          <span className="hidden sm:inline">Quay lại</span>
        </Button>

        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          {fileMetadata && (
            <>
              <h1 className="min-w-0 truncate text-sm font-medium sm:text-base" title={fileMetadata.name}>
                {fileMetadata.name}
              </h1>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
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
              </div>
            </>
          )}
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-2 sm:p-4">
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
            <Button onClick={onBack} className="mt-2">
              Quay về trang chủ
            </Button>
          </div>
        )}

        <div
          className={[
            'w-full max-w-360',
            '[&_.plyr]:overflow-hidden [&_.plyr]:rounded-lg [&_.plyr]:border [&_.plyr]:border-border [&_.plyr]:bg-black [&_.plyr]:shadow-2xl',
            isLoading || error ? 'hidden' : '',
          ].join(' ')}
        >
          <video ref={videoRef} crossOrigin="anonymous" playsInline />
        </div>
      </main>

      <div className="hidden min-h-10 flex-wrap items-center justify-center gap-2 border-t bg-background/95 px-4 py-2 text-xs text-muted-foreground md:flex">
        {['Space', '←→', '↑↓', 'F', 'M', '<>'].map((key) => (
          <span key={key} className="rounded-md border bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
            {key}
          </span>
        ))}
      </div>
    </div>
  );
}
