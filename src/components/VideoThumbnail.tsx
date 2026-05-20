import { useState } from 'react';
import { Play } from 'lucide-react';
import { buildThumbnailUrl, type DriveFile } from '@/core/drive';
import { cn } from '@/lib/utils';

type ThumbnailSource = 'direct' | 'proxy' | 'fallback';

interface VideoThumbnailProps {
  file: Pick<DriveFile, 'id' | 'name' | 'resourceKey' | 'thumbnailLink'>;
  className?: string;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
}

export function VideoThumbnail({
  file,
  className,
  loading = 'lazy',
  fetchPriority = 'auto',
}: VideoThumbnailProps) {
  const thumbnailKey = `${file.id}:${file.resourceKey ?? ''}:${file.thumbnailLink ?? ''}`;
  const [sourceState, setSourceState] = useState<{ key: string; source: ThumbnailSource }>({
    key: thumbnailKey,
    source: 'direct',
  });
  const source = sourceState.key === thumbnailKey ? sourceState.source : 'direct';

  // Try direct thumbnailLink first (pre-signed, no CORS for <img> tags),
  // fall back to SW proxy, then to a placeholder icon.
  const src = file.thumbnailLink
    ? source === 'direct'
      ? file.thumbnailLink
      : source === 'proxy'
        ? buildThumbnailUrl(file.id, file.resourceKey)
        : null
    : null;

  if (!src) {
    return (
      <div className={cn('flex size-full items-center justify-center bg-muted', className)}>
        <Play className="size-7 text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      onError={() => {
        setSourceState({
          key: thumbnailKey,
          source: source === 'direct' ? 'proxy' : 'fallback',
        });
      }}
    />
  );
}
