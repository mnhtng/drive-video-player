import { useEffect, useRef, useState } from 'react';
import Plyr from 'plyr';
import { buildProxyUrl, getFileMetadata, type DriveFile } from '@/core/drive';

export interface UsePlayerOptions {
  fileId: string | null;
  token: string | null;
  onEnded?: () => void;
  onError?: (error: string) => void;
}

export interface UsePlayerReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  player: Plyr | null;
  fileMetadata: DriveFile | null;
  isLoading: boolean;
  error: string | null;
}

// Save/restore position for resume playback
const POSITION_KEY_PREFIX = 'gdrive_player_pos_';

function savePosition(fileId: string, time: number) {
  if (time > 5) {
    localStorage.setItem(`${POSITION_KEY_PREFIX}${fileId}`, String(time));
  }
}

function getPosition(fileId: string): number {
  const saved = localStorage.getItem(`${POSITION_KEY_PREFIX}${fileId}`);
  return saved ? parseFloat(saved) : 0;
}

function clearPosition(fileId: string) {
  localStorage.removeItem(`${POSITION_KEY_PREFIX}${fileId}`);
}

export function usePlayer({
  fileId,
  token,
  onEnded,
  onError,
}: UsePlayerOptions): UsePlayerReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playerInstance, setPlayerInstance] = useState<Plyr | null>(null);
  const [fileMetadata, setFileMetadata] = useState<DriveFile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Initialize Plyr
  useEffect(() => {
    if (!videoRef.current) return;

    // @ts-expect-error - plyr types have conflicting export assignments
    const player = new Plyr(videoRef.current, {
      controls: [
        'play-large',
        'rewind',
        'play',
        'fast-forward',
        'progress',
        'current-time',
        'duration',
        'mute',
        'volume',
        'captions',
        'settings',
        'pip',
        'airplay',
        'fullscreen',
      ],
      settings: ['captions', 'quality', 'speed', 'loop'],
      speed: {
        selected: 1,
        options: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
      },
      keyboard: {
        focused: true,
        global: true,
      },
      tooltips: {
        controls: true,
        seek: true,
      },
      captions: {
        active: false,
        language: 'auto',
        update: true,
      },
      seekTime: 5,
      invertTime: false,
      i18n: {
        restart: 'Phát lại',
        rewind: 'Tua lại {seektime}s',
        play: 'Phát',
        pause: 'Tạm dừng',
        fastForward: 'Tua tới {seektime}s',
        seek: 'Tìm kiếm',
        seekLabel: '{currentTime} / {duration}',
        played: 'Đã phát',
        buffered: 'Đã tải',
        currentTime: 'Thời gian hiện tại',
        duration: 'Thời lượng',
        volume: 'Âm lượng',
        mute: 'Tắt tiếng',
        unmute: 'Bật tiếng',
        enableCaptions: 'Bật phụ đề',
        disableCaptions: 'Tắt phụ đề',
        download: 'Tải xuống',
        enterFullscreen: 'Toàn màn hình',
        exitFullscreen: 'Thoát toàn màn hình',
        frameTitle: 'Trình phát cho {title}',
        captions: 'Phụ đề',
        settings: 'Cài đặt',
        pip: 'Ảnh trong ảnh',
        menuBack: 'Quay lại menu trước',
        speed: 'Tốc độ',
        normal: 'Chuẩn',
        quality: 'Chất lượng',
        loop: 'Lặp lại',
        start: 'Bắt đầu',
        end: 'Kết thúc',
        all: 'Tất cả',
        reset: 'Đặt lại',
        disabled: 'Tắt',
        enabled: 'Bật',
        advertisement: 'Quảng cáo',
        qualityBadge: {
          2160: '4K',
          1440: 'HD',
          1080: 'HD',
          720: 'HD',
          576: 'SD',
          480: 'SD',
        },
      },
    });

    setPlayerInstance(player);

    // Handle end
    player.on('ended', () => {
      if (fileId) clearPosition(fileId);
      onEnded?.();
    });

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
      player.destroy();
      setPlayerInstance(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Initialize Plyr only once

  // Load video when fileId or token changes
  useEffect(() => {
    if (!fileId || !token) return;

    let cancelled = false;

    async function loadVideo() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch metadata
        const metadata = await getFileMetadata(fileId!, token!);
        if (cancelled) return;

        if (!metadata) {
          setError('Không thể tải thông tin video. Kiểm tra quyền truy cập.');
          setIsLoading(false);
          return;
        }

        setFileMetadata(metadata);

        // Update page title
        document.title = `${metadata.name} — Nimbus Player`;

        // Set video source via proxy
        const proxyUrl = buildProxyUrl(fileId!);

        if (videoRef.current) {
          videoRef.current.src = proxyUrl;
          videoRef.current.load();

          // Restore position
          const savedPosition = getPosition(fileId!);
          if (savedPosition > 0) {
            videoRef.current.addEventListener(
              'loadedmetadata',
              () => {
                if (videoRef.current && savedPosition < videoRef.current.duration - 10) {
                  videoRef.current.currentTime = savedPosition;
                }
              },
              { once: true }
            );
          }

          // Auto-save position every 5 seconds
          if (saveIntervalRef.current) {
            clearInterval(saveIntervalRef.current);
          }
          saveIntervalRef.current = setInterval(() => {
            if (videoRef.current && !videoRef.current.paused && fileId) {
              savePosition(fileId, videoRef.current.currentTime);
            }
          }, 5000);
        }

        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError('Lỗi khi tải video');
        setIsLoading(false);
        onError?.(String(err));
      }
    }

    loadVideo();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, token]);

  return {
    videoRef,
    player: playerInstance,
    fileMetadata,
    isLoading,
    error,
  };
}
