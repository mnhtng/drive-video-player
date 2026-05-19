import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import {
  BadgeCheck,
  CircleAlert,
  Code2,
  FolderOpen,
  HelpCircle,
  Link,
  LogIn,
  LogOut,
  Play,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { extractDriveFileReference, extractFolderId, getFileMetadata } from '@/core/drive';
import type { UserInfo } from '@/core/auth';
import { APP_NAME } from '@/core/constants';
import DriveBrowser from '@/components/DriveBrowser';

interface HomeViewProps {
  user: UserInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  authConfigured: boolean;
  authError: string | null;
  onHome: () => void;
  onLogin: (pendingFileId?: string, pendingLocation?: string) => void;
  onLogout: () => void;
  onPlay: (fileId: string, resourceKey?: string) => void;
  onBrowseFolder: (folderId: string) => void;
  folderId?: string;
}

export default function HomeView({
  user,
  token,
  isAuthenticated,
  authConfigured,
  authError,
  onHome,
  onLogin,
  onLogout,
  onPlay,
  onBrowseFolder,
  folderId,
}: HomeViewProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  // Prefetch video metadata — only when input looks like a complete reference
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const reference = extractDriveFileReference(inputValue);
    if (!reference) return;

    // Only prefetch metadata, not the stream; stream prefetch is wasteful while editing.
    const timer = window.setTimeout(() => {
      void getFileMetadata(reference.fileId, token, reference.resourceKey);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [inputValue, isAuthenticated, token]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const folderId = extractFolderId(inputValue);
    if (folderId) {
      onBrowseFolder(folderId);
      return;
    }

    const reference = extractDriveFileReference(inputValue);
    if (!reference) {
      setError('Link, folder URL hoặc ID không hợp lệ. Vui lòng kiểm tra lại.');
      return;
    }

    onPlay(reference.fileId, reference.resourceKey);
  };

  const handleHomeClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    onHome();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a
            href="/"
            onClick={handleHomeClick}
            className="flex min-w-0 items-center gap-3 rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="header-logo-mark flex size-10 shrink-0 items-center justify-center rounded-lg bg-card">
              <img src="/play-icon.png" alt="" className="header-logo-icon size-7" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-5 sm:text-base">{APP_NAME}</span>
              <span className="hidden text-xs font-medium text-muted-foreground sm:block">
                Google Drive player
              </span>
            </span>
          </a>

          <nav aria-label="Liên kết chính" className="hidden items-center gap-1 md:flex">
            <a
              href="#drive-browser"
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <FolderOpen className="size-4" />
              Drive
            </a>
            <a
              href="/privacy.html"
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ShieldCheck className="size-4" />
              Quyền riêng tư
            </a>
            <a
              href="/support.html"
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <HelpCircle className="size-4" />
              Hỗ trợ
            </a>
          </nav>

          {isAuthenticated ? (
            <div className="flex max-w-[48vw] items-center gap-1 rounded-lg border bg-card/80 p-1 shadow-sm sm:max-w-none sm:gap-2">
              {user ? (
                <>
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="size-8 rounded-full border object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <span className="hidden min-w-0 px-1 sm:block">
                    <span className="block max-w-44 truncate text-sm font-medium leading-4">{user.name}</span>
                    <span className="block text-xs leading-4 text-muted-foreground">Đã đăng nhập</span>
                  </span>
                </>
              ) : (
                <span className="px-2 text-sm font-medium text-muted-foreground">Đã đăng nhập</span>
              )}
              <Button variant="ghost" size="icon" onClick={onLogout} title="Đăng xuất" aria-label="Đăng xuất">
                <LogOut />
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => onLogin()}
              disabled={!authConfigured}
              size="lg"
              className="h-10 px-3 sm:px-4"
              title={!authConfigured ? 'Google OAuth chưa được cấu hình' : undefined}
            >
              <LogIn />
              <span className="hidden sm:inline">Đăng nhập Google</span>
              <span className="sm:hidden">Đăng nhập</span>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-4 px-4 py-6 sm:px-6 lg:py-12">
        <section className="rounded-lg border bg-card p-5 shadow-sm sm:p-8 lg:p-10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
            <BadgeCheck className="size-3.5 text-primary" />
            Trình phát video Google Drive
          </div>

          <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-balance sm:text-5xl lg:text-6xl">
            Phát video Drive trong một trình phát gọn, nhanh và riêng tư.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Dán link Google Drive hoặc File ID để mở video với giao diện player tối giản, hỗ trợ PiP,
            tua nhanh, tốc độ phát và ghi nhớ vị trí xem.
          </p>

          {authError ? (
            <div
              role="alert"
              className="mt-5 flex max-w-2xl items-start gap-3 rounded-lg border border-destructive/45 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{authError}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-8 max-w-3xl">
            <Field>
              <FieldLabel htmlFor="drive-input">Google Drive URL hoặc File ID</FieldLabel>
              <div className="grid gap-2 sm:relative sm:block">
                <Link className="pointer-events-none absolute left-3 top-1/2 hidden size-4 -translate-y-1/2 text-muted-foreground sm:block" />
                <Input
                  id="drive-input"
                  type="text"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setError('');
                  }}
                  placeholder="https://drive.google.com/file/d/..."
                  className="h-12 rounded-lg bg-background text-sm sm:pl-10 sm:pr-24"
                  autoFocus
                  aria-invalid={!!error}
                />
                <Button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="h-10 px-3 sm:absolute sm:right-1 sm:top-1"
                >
                  <Play className="fill-current" />
                  Phát
                </Button>
              </div>
              <FieldError>{error}</FieldError>
            </Field>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Hỗ trợ</span>
            <span className="rounded-md border bg-muted px-2 py-1 font-mono">drive.google.com/file/d/...</span>
            <span className="rounded-md border bg-muted px-2 py-1 font-mono">drive.google.com/open?id=...</span>
            <span className="rounded-md border bg-muted px-2 py-1 font-mono">drive.google.com/drive/folders/...</span>
            <span className="rounded-md border bg-muted px-2 py-1 font-mono">File ID</span>
          </div>
        </section>

        {isAuthenticated && token ? (
          <DriveBrowser token={token} folderId={folderId} onPlay={onPlay} />
        ) : (
          <section id="drive-browser" className="mt-6 rounded-lg border bg-card p-5 shadow-sm sm:p-6">
            <div>
              <h2 className="text-base font-semibold">Duyệt và tìm kiếm video trong Drive</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Đăng nhập để mở file browser, tìm video và duyệt playlist theo folder.
              </p>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t bg-card/35">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm text-muted-foreground sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="max-w-xl">
            <a
              href="/"
              onClick={handleHomeClick}
              className="inline-flex items-center gap-3 rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-9 items-center justify-center rounded-lg border bg-background">
                <img src="/play-icon.png" alt="" className="size-6" />
              </span>
              <span className="font-semibold text-foreground">{APP_NAME}</span>
            </a>
            <p className="mt-3 leading-6">
              Mở và phát video được lưu trong Google Drive của người dùng.
            </p>
            <p className="mt-3 text-xs">© {new Date().getFullYear()} {APP_NAME}.</p>
          </div>

          <nav aria-label="Liên kết chân trang" className="grid gap-2 sm:grid-cols-2 lg:min-w-[28rem]">
            <a
              href="/privacy.html"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ShieldCheck className="size-4 text-muted-foreground" />
              Chính sách quyền riêng tư
            </a>
            <a
              href="/terms.html"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Scale className="size-4 text-muted-foreground" />
              Điều khoản sử dụng
            </a>
            <a
              href="/support.html"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <HelpCircle className="size-4 text-muted-foreground" />
              Hỗ trợ
            </a>
            <a
              href="/developer.html"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Code2 className="size-4 text-muted-foreground" />
              Nhà phát triển
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
