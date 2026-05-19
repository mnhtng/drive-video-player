import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CircleAlert,
  Clock3,
  Film,
  FolderOpen,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import {
  DRIVE_BROWSER_FOLDER_VIDEO_LIMIT,
  DRIVE_BROWSER_VIDEO_LIMIT,
  getFolderInfo,
  listDriveVideos,
  listFolderVideosPage,
  searchDriveVideos,
  type DriveFile,
} from '@/core/drive';
import { formatDuration, formatFileSize } from '@/utils/string';

interface DriveBrowserProps {
  token: string;
  folderId?: string;
  onPlay: (fileId: string, resourceKey?: string) => void;
}

type BrowserMode = 'recent' | 'search' | 'folder';

const modifiedDateFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
});

function formatModifiedTime(value?: string): string {
  if (!value) return '';

  return modifiedDateFormatter.format(new Date(value));
}

function getModeTitle(mode: BrowserMode, query: string, folderName: string | null): string {
  if (mode === 'folder') return folderName ? `Thư mục: ${folderName}` : 'Video trong thư mục';
  if (mode === 'search') return `Kết quả cho "${query}"`;
  return 'Video gần đây';
}

export default function DriveBrowser({ token, folderId, onPlay }: DriveBrowserProps) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  // `folderOverridden` means the user explicitly searched/cleared while a folder URL is active.
  const [folderOverridden, setFolderOverridden] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Use a ref for token so loadFiles effect doesn't re-run on silent token refreshes
  const tokenRef = useRef(token);
  const loadVersionRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const activeFolderId = folderOverridden ? null : (folderId ?? null);
  const mode: BrowserMode = activeFolderId ? 'folder' : submittedQuery ? 'search' : 'recent';
  const title = useMemo(
    () => getModeTitle(mode, submittedQuery, folderName),
    [folderName, mode, submittedQuery]
  );

  useEffect(() => {
    let cancelled = false;
    const loadVersion = loadVersionRef.current + 1;
    loadVersionRef.current = loadVersion;

    async function loadFiles() {
      const currentToken = tokenRef.current;
      if (!currentToken) return;

      setIsLoading(true);
      setIsLoadingMore(false);
      setError(null);
      setNextPageToken(null);

      try {
        if (activeFolderId) {
          const [folderInfo, fileResult] = await Promise.all([
            getFolderInfo(activeFolderId, currentToken),
            listFolderVideosPage(activeFolderId, currentToken, {
              pageSize: DRIVE_BROWSER_FOLDER_VIDEO_LIMIT,
            }),
          ]);

          if (cancelled || loadVersionRef.current !== loadVersion) return;
          setFolderName(folderInfo?.name ?? null);
          setFiles(fileResult?.files ?? []);
          setNextPageToken(fileResult?.nextPageToken ?? null);
          if (!fileResult) setError('Không thể tải danh sách video trong thư mục này.');
          return;
        }

        setFolderName(null);
        const fileResult = submittedQuery
          ? await searchDriveVideos(submittedQuery, currentToken)
          : await listDriveVideos(currentToken);

        if (cancelled || loadVersionRef.current !== loadVersion) return;
        setFiles((fileResult?.files ?? []).slice(0, DRIVE_BROWSER_VIDEO_LIMIT));
        if (!fileResult) setError('Không thể tải video từ Google Drive.');
      } finally {
        if (!cancelled && loadVersionRef.current === loadVersion) setIsLoading(false);
      }
    }

    void loadFiles();

    return () => {
      cancelled = true;
    };
  }, [activeFolderId, reloadKey, submittedQuery]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = query.trim();
    setFolderOverridden(true);
    setSubmittedQuery(nextQuery);
    setNextPageToken(null);
  };

  const handleClearSearch = () => {
    setQuery('');
    setSubmittedQuery('');
    setFolderOverridden(false);
    setNextPageToken(null);
  };

  const handleRefresh = () => {
    setReloadKey((value) => value + 1);
  };

  const handleLoadMore = async () => {
    if (!activeFolderId || !nextPageToken || isLoadingMore) return;

    const currentToken = tokenRef.current;
    const currentLoadVersion = loadVersionRef.current;
    setIsLoadingMore(true);
    setError(null);

    try {
      const fileResult = await listFolderVideosPage(activeFolderId, currentToken, {
        pageToken: nextPageToken,
        pageSize: DRIVE_BROWSER_FOLDER_VIDEO_LIMIT,
      });

      if (!isMountedRef.current || loadVersionRef.current !== currentLoadVersion) return;

      if (!fileResult) {
        setError('Không thể tải thêm video trong thư mục này.');
        return;
      }

      setFiles((currentFiles) => {
        const knownIds = new Set(currentFiles.map((file) => file.id));
        const newFiles = (fileResult.files ?? []).filter((file) => !knownIds.has(file.id));
        return [...currentFiles, ...newFiles];
      });
      setNextPageToken(fileResult.nextPageToken ?? null);
    } finally {
      if (isMountedRef.current && loadVersionRef.current === currentLoadVersion) {
        setIsLoadingMore(false);
      }
    }
  };

  return (
    <section id="drive-browser" className="mt-6 grid gap-4 scroll-mt-24 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FolderOpen className="size-4 text-primary" />
          Thư viện Drive
        </div>

        <form onSubmit={handleSearch} className="mt-4 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm video..."
              className="h-10 pl-9 pr-9"
            />
            {(query || submittedQuery || activeFolderId) && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Xóa tìm kiếm"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button type="submit" className="w-full">
            <Search />
            Tìm kiếm
          </Button>
        </form>

        <div className="mt-4 space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
            <span>Chế độ</span>
            <span className="font-medium text-foreground">
              {mode === 'folder' ? 'Thư mục' : mode === 'search' ? 'Tìm kiếm' : 'Gần đây'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
            <span>Số video</span>
            <span className="font-medium text-foreground">{files.length}{nextPageToken ? '+' : ''}</span>
          </div>
        </div>
      </aside>

      <div className="min-w-0 rounded-lg border bg-card">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold sm:text-base" title={title}>
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {mode === 'folder'
                ? `Hiển thị ${DRIVE_BROWSER_FOLDER_VIDEO_LIMIT} video mỗi lần để giữ trang phản hồi nhanh`
                : 'Chọn một video để mở trong player'}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading}>
            {isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Làm mới
          </Button>
        </div>

        {error ? (
          <div
            role="alert"
            className="m-4 flex items-start gap-3 rounded-lg border border-destructive/45 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex min-h-72 items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="size-7 animate-spin text-primary" />
              <span className="text-sm">Đang tải thư viện...</span>
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground">
            <Film className="size-10 text-muted-foreground/50" />
            <p className="text-sm">Không tìm thấy video phù hợp.</p>
          </div>
        ) : (
          <>
            <div className="divide-y">
              {files.map((file, index) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => onPlay(file.id, file.resourceKey)}
                  className="grid w-full grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-3 text-left transition hover:bg-muted/45 focus-visible:bg-muted/45 focus-visible:outline-none sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:px-4"
                >
                  <div className="relative aspect-video overflow-hidden rounded-md bg-black">
                    <VideoThumbnail
                      file={file}
                      className="size-full object-cover"
                      loading={index === 0 ? 'eager' : 'lazy'}
                      fetchPriority={index === 0 ? 'high' : 'auto'}
                    />
                    {file.videoMediaMetadata?.durationMillis ? (
                      <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {formatDuration(file.videoMediaMetadata.durationMillis)}
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0 self-center">
                    <div className="truncate text-sm font-medium text-foreground" title={file.name}>
                      {file.name}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {file.size ? (
                        <span className="inline-flex items-center gap-1">
                          <HardDrive className="size-3.5" />
                          {formatFileSize(file.size)}
                        </span>
                      ) : null}
                      {file.modifiedTime ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3.5" />
                          {formatModifiedTime(file.modifiedTime)}
                        </span>
                      ) : null}
                      {file.videoMediaMetadata?.width ? (
                        <span>
                          {file.videoMediaMetadata.width}×{file.videoMediaMetadata.height}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="hidden self-center sm:block">
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
                      <Play className="size-4 fill-current" />
                      Phát
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {mode === 'folder' && nextPageToken ? (
              <div className="border-t p-3 text-center">
                <Button type="button" variant="secondary" onClick={handleLoadMore} disabled={isLoadingMore}>
                  {isLoadingMore ? <Loader2 className="animate-spin" /> : null}
                  Tải thêm
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
