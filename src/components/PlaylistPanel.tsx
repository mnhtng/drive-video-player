import { useState, useEffect } from 'react';
import { Loader2, Play, LayoutList } from 'lucide-react';
import { listFolderVideos, prefetchDriveVideo, type DriveFile } from '@/core/drive';
import { formatDuration } from '@/utils/string';

interface PlaylistPanelProps {
  folderId: string;
  token: string;
  currentFileId: string;
  onSelect: (fileId: string) => void;
}

export function PlaylistPanel({ folderId, token, currentFileId, onSelect }: PlaylistPanelProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchPlaylist() {
      if (!folderId || !token) return;
      setIsLoading(true);
      setError(null);
      const res = await listFolderVideos(folderId, token);
      if (cancelled) return;
      if (res && res.files) {
        setFiles(res.files);
      } else {
        setError('Không thể tải danh sách video');
      }
      setIsLoading(false);
    }

    fetchPlaylist();
    return () => {
      cancelled = true;
    };
  }, [folderId, token]);

  const prefetchFile = (file: DriveFile) => {
    if (file.id === currentFileId) return;
    void prefetchDriveVideo(file, token);
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Không có video nào khác trong thư mục
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card border-l">
      <div className="flex items-center gap-2 border-b p-3 font-semibold shadow-sm">
        <LayoutList className="size-4" />
        <span className="text-sm">Playlist Thư Mục</span>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {files.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {files.map((file) => {
          const isCurrent = file.id === currentFileId;
          return (
            <button
              key={file.id}
              onClick={() => !isCurrent && onSelect(file.id)}
              onPointerEnter={() => prefetchFile(file)}
              onFocus={() => prefetchFile(file)}
              className={[
                'flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors hover:bg-muted/50',
                isCurrent ? 'bg-muted/80 ring-1 ring-primary/50' : '',
              ].join(' ')}
            >
              <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded bg-black">
                {file.thumbnailLink ? (
                  <img src={file.thumbnailLink} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center bg-muted">
                    <Play className="size-6 text-muted-foreground/30" />
                  </div>
                )}
                {file.videoMediaMetadata?.durationMillis && (
                  <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-medium text-white">
                    {formatDuration(file.videoMediaMetadata.durationMillis)}
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                    <div className="flex gap-0.5">
                      <div className="w-1 animate-pulse bg-primary h-3"></div>
                      <div className="w-1 animate-pulse bg-primary h-4 delay-75"></div>
                      <div className="w-1 animate-pulse bg-primary h-2 delay-150"></div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col overflow-hidden py-0.5">
                <span className="truncate text-sm font-medium leading-tight" title={file.name}>
                  {file.name}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {isCurrent ? 'Đang phát' : 'Nhấn để phát'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
