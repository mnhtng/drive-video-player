import { useEffect, useRef, useState } from 'react';
import Plyr from 'plyr';
import {
  buildProxyUrl,
  fetchDriveFileText,
  getFileMetadata,
  listFolderSubtitleFiles,
  listFolderVideosPage,
  type DriveFile,
} from '@/core/drive';
import { APP_NAME, POSITION_KEY_PREFIX, QUALITY_OPTIONS } from '@/core/constants';
import { LANGUAGE_LABELS, LANGUAGE_ALIASES, PLYR_I18N_VI } from '@/core/i18n';

export interface UsePlayerOptions {
  fileId: string | null;
  token: string | null;
  resourceKey?: string;
  reloadKey?: number;
  onEnded?: () => void;
  onError?: (error: string) => void;
}

export interface UsePlayerReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  player: Plyr | null;
  fileMetadata: DriveFile | null;
  captionTracks: PlayerCaptionTrack[];
  localCaptionTracks: PlayerCaptionTrack[];
  qualitySources: PlayerQualitySource[];
  isLoading: boolean;
  error: string | null;
  subtitleError: string | null;
  addLocalSubtitleFiles: (files: File[]) => Promise<void>;
  clearLocalSubtitleTracks: () => void;
}

export interface PlayerCaptionTrack {
  label: string;
  language?: string;
  fileName: string;
}

export interface PlayerQualitySource {
  fileId: string;
  name: string;
  label: string;
  quality: number | null;
  isCurrentFile: boolean;
}

// Save/restore position for resume playback

const PLAYER_READY_TIMEOUT_MS = 5000;
const VIDEO_LOAD_TIMEOUT_MS = 45000;
const HAVE_METADATA_READY_STATE = 1;
const MAX_SUBTITLE_TRACKS = 8;
const RELATED_FOLDER_VIDEO_LIMIT = 100;
const VIDEO_READY_EVENTS = [
  'loadedmetadata',
  'loadeddata',
  'canplay',
  'canplaythrough',
  'playing',
] as const;

type PlyrWithMedia = Plyr & {
  media?: HTMLVideoElement;
};

type PlyrWithInternals = PlyrWithMedia & {
  ready?: boolean;
};

type HTMLVideoElementWithPlyr = HTMLVideoElement & {
  plyr?: Plyr;
};

interface BuiltVideoSource {
  file: DriveFile;
  src: string;
  quality: number | null;
  isCurrentFile: boolean;
}

interface BuiltSubtitleTrack {
  kind: 'subtitles';
  label: string;
  srclang: string;
  src: string;
  default?: boolean;
}

interface PlayerSourceInfo {
  type: 'video';
  title?: string;
  poster?: string;
  sources: Array<{
    src: string;
    size?: number;
  }>;
  tracks: BuiltSubtitleTrack[];
}



function hasLoadedMetadata(video: HTMLVideoElement): boolean {
  return video.readyState >= HAVE_METADATA_READY_STATE;
}

function isCurrentSource(video: HTMLVideoElement, expectedUrls: Set<string>): boolean {
  return expectedUrls.has(video.currentSrc || video.src);
}

function describeVideoState(video: HTMLVideoElement): string {
  const buffered = Array.from({ length: video.buffered.length }, (_, index) => {
    return `${video.buffered.start(index).toFixed(2)}-${video.buffered.end(index).toFixed(2)}`;
  }).join(', ');

  return [
    `readyState=${video.readyState}`,
    `networkState=${video.networkState}`,
    `duration=${Number.isFinite(video.duration) ? video.duration.toFixed(2) : String(video.duration)}`,
    `buffered=${buffered || 'none'}`,
    `src=${video.currentSrc || video.src || 'none'}`,
  ].join(', ');
}

function getVideoErrorMessage(video: HTMLVideoElement): string {
  const code = video.error?.code;

  if (code === MediaError.MEDIA_ERR_ABORTED) {
    return 'Tải video đã bị hủy.';
  }

  if (code === MediaError.MEDIA_ERR_NETWORK) {
    return 'Không thể tải stream video từ Google Drive. Kiểm tra request /api/drive-proxy trong tab Network.';
  }

  if (code === MediaError.MEDIA_ERR_DECODE) {
    return 'Trình duyệt không giải mã được định dạng video này.';
  }

  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return 'Nguồn video không được hỗ trợ hoặc proxy trả về lỗi thay vì dữ liệu video.';
  }

  return 'Không thể tải stream video.';
}

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

function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

function getFileExtension(fileName: string): string {
  return fileName.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? '';
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeMediaGroupName(fileName: string): string {
  return normalizeSearchText(stripFileExtension(fileName))
    .replace(/\b(?:4320|2160|1440|1080|720|576|540|480|360|240|144)p\b/g, ' ')
    .replace(/\b(?:8k|4k|uhd|fhd)\b/g, ' ')
    .replace(/[\s._()[\]{}-]+/g, ' ')
    .trim();
}

function isSubtitleExtension(fileName: string): boolean {
  return ['vtt', 'srt'].includes(getFileExtension(fileName));
}

function isLanguageToken(token: string): boolean {
  return token in LANGUAGE_LABELS || token in LANGUAGE_ALIASES || /^[a-z]{2}$/.test(token);
}

function normalizeSubtitleGroupName(fileName: string): string {
  const tokens = normalizeMediaGroupName(fileName).split(' ').filter(Boolean);

  while (tokens.length > 1 && isLanguageToken(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  return tokens.join(' ');
}

function subtitleMatchesVideo(subtitleFile: DriveFile, videoGroupName: string): boolean {
  if (!isSubtitleExtension(subtitleFile.name)) return false;

  const subtitleGroupName = normalizeSubtitleGroupName(subtitleFile.name);
  return (
    subtitleGroupName === videoGroupName
    || subtitleGroupName.startsWith(`${videoGroupName} `)
    || videoGroupName.startsWith(`${subtitleGroupName} `)
  );
}

function inferQualityFromName(fileName: string): number | null {
  const normalized = normalizeSearchText(stripFileExtension(fileName));
  const resolutionMatch = normalized.match(/\b(4320|2160|1440|1080|720|576|540|480|360|240|144)p\b/);
  if (resolutionMatch) return Number(resolutionMatch[1]);

  if (/\b(?:8k)\b/.test(normalized)) return 4320;
  if (/\b(?:4k|uhd)\b/.test(normalized)) return 2160;
  if (/\bfhd\b/.test(normalized)) return 1080;

  return null;
}

function normalizeQualityHeight(height: number): number {
  const closeStandard = QUALITY_OPTIONS.find((quality) => {
    return Math.abs(quality - height) <= Math.max(12, quality * 0.03);
  });

  return closeStandard ?? Math.round(height);
}

function inferQuality(file: DriveFile): number | null {
  const metadataHeight = file.videoMediaMetadata?.height;
  if (metadataHeight && Number.isFinite(metadataHeight)) {
    return normalizeQualityHeight(metadataHeight);
  }

  return inferQualityFromName(file.name);
}

function buildPlyrQualityOptions(sources: BuiltVideoSource[]): number[] {
  const sourceQualities = sources
    .map((source) => source.quality)
    .filter((quality): quality is number => Boolean(quality));

  return Array.from(new Set([...sourceQualities, ...QUALITY_OPTIONS]))
    .sort((a, b) => b - a);
}

function toPlayerQualitySources(sources: BuiltVideoSource[]): PlayerQualitySource[] {
  return sources.map((source) => ({
    fileId: source.file.id,
    name: source.file.name,
    label: source.quality ? `${source.quality}p` : 'Gốc',
    quality: source.quality,
    isCurrentFile: source.isCurrentFile,
  }));
}

function buildVideoSources(metadata: DriveFile, folderVideos: DriveFile[], fallbackResourceKey?: string): BuiltVideoSource[] {
  const metadataResourceKey = metadata.resourceKey ?? fallbackResourceKey;
  const currentQuality = inferQuality(metadata);
  const currentSource: BuiltVideoSource = {
    file: metadata,
    src: buildProxyUrl(metadata.id, metadata.size, metadataResourceKey),
    quality: currentQuality,
    isCurrentFile: true,
  };

  const videoGroupName = normalizeMediaGroupName(metadata.name);
  if (!videoGroupName) return [currentSource];

  const candidates = [metadata];
  const seenFileIds = new Set([metadata.id]);

  folderVideos.forEach((file) => {
    if (seenFileIds.has(file.id)) return;
    if (normalizeMediaGroupName(file.name) !== videoGroupName) return;

    seenFileIds.add(file.id);
    candidates.push(file);
  });

  const sourcesByQuality = new Map<number, BuiltVideoSource>();
  candidates.forEach((file) => {
    const quality = inferQuality(file);
    if (!quality || sourcesByQuality.has(quality)) return;

    sourcesByQuality.set(quality, {
      file,
      src: buildProxyUrl(file.id, file.size, file.id === metadata.id ? metadataResourceKey : file.resourceKey),
      quality,
      isCurrentFile: file.id === metadata.id,
    });
  });

  if (!currentQuality || sourcesByQuality.size < 2) {
    return [currentSource];
  }

  const current = sourcesByQuality.get(currentQuality) ?? currentSource;
  const alternatives = Array.from(sourcesByQuality.values())
    .filter((source) => source.file.id !== current.file.id)
    .sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));

  return [current, ...alternatives];
}

function inferSubtitleLanguage(fileName: string): string | undefined {
  const tokens = normalizeSearchText(stripFileExtension(fileName))
    .split(/[\s._()[\]{}-]+/)
    .filter(Boolean);

  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token in LANGUAGE_ALIASES) return LANGUAGE_ALIASES[token];
    if (token in LANGUAGE_LABELS || /^[a-z]{2}$/.test(token)) return token;
  }

  return undefined;
}

function inferSubtitleLabel(fileName: string, index: number): string {
  const language = inferSubtitleLanguage(fileName);
  if (language && LANGUAGE_LABELS[language]) return LANGUAGE_LABELS[language];

  const label = stripFileExtension(fileName)
    .replace(/\b(?:subtitles?|captions?|cc)\b/gi, '')
    .replace(/[\s._()[\]{}-]+/g, ' ')
    .trim();

  return label || `Phụ đề ${index + 1}`;
}

function normalizeSubtitleText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function srtToWebVtt(text: string): string {
  const body = normalizeSubtitleText(text)
    .replace(/^\d+\n(?=\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3})/gm, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

  return `WEBVTT\n\n${body}\n`;
}

function toWebVtt(text: string, fileName: string): string {
  const normalized = normalizeSubtitleText(text);
  if (/^WEBVTT\b/i.test(normalized)) return `${normalized}\n`;
  if (getFileExtension(fileName) === 'srt') return srtToWebVtt(normalized);

  return `WEBVTT\n\n${normalized}\n`;
}

async function buildSubtitleTracks(
  metadata: DriveFile,
  subtitleFiles: DriveFile[],
  token: string
): Promise<{
  tracks: BuiltSubtitleTrack[];
  blobUrls: string[];
  captions: PlayerCaptionTrack[];
}> {
  const videoGroupName = normalizeMediaGroupName(metadata.name);
  const matchingSubtitleFiles = subtitleFiles
    .filter((file) => subtitleMatchesVideo(file, videoGroupName))
    .slice(0, MAX_SUBTITLE_TRACKS);
  const fallbackSubtitleFiles = matchingSubtitleFiles.length === 0 && subtitleFiles.length === 1
    ? subtitleFiles.filter((file) => isSubtitleExtension(file.name))
    : matchingSubtitleFiles;

  const tracks: BuiltSubtitleTrack[] = [];
  const captions: PlayerCaptionTrack[] = [];
  const blobUrls: string[] = [];

  for (const file of fallbackSubtitleFiles) {
    const text = await fetchDriveFileText(file.id, token, file.resourceKey);
    if (!text) continue;

    const src = URL.createObjectURL(new Blob([toWebVtt(text, file.name)], { type: 'text/vtt' }));
    const language = inferSubtitleLanguage(file.name);
    const label = inferSubtitleLabel(file.name, tracks.length);
    blobUrls.push(src);
    tracks.push({
      kind: 'subtitles',
      label,
      srclang: language ?? `x-subtitle-${tracks.length + 1}`,
      src,
      default: tracks.length === 0,
    });
    captions.push({
      label,
      language,
      fileName: file.name,
    });
  }

  return { tracks, blobUrls, captions };
}

async function buildUploadedSubtitleTracks(files: File[]): Promise<{
  tracks: BuiltSubtitleTrack[];
  blobUrls: string[];
  captions: PlayerCaptionTrack[];
}> {
  const supportedFiles = files
    .filter((file) => isSubtitleExtension(file.name))
    .slice(0, MAX_SUBTITLE_TRACKS);

  const tracks: BuiltSubtitleTrack[] = [];
  const captions: PlayerCaptionTrack[] = [];
  const blobUrls: string[] = [];

  for (const file of supportedFiles) {
    const text = await file.text();
    const src = URL.createObjectURL(new Blob([toWebVtt(text, file.name)], { type: 'text/vtt' }));
    const language = inferSubtitleLanguage(file.name);
    const label = inferSubtitleLabel(file.name, tracks.length);
    blobUrls.push(src);
    tracks.push({
      kind: 'subtitles',
      label,
      srclang: language ?? `x-uploaded-subtitle-${tracks.length + 1}`,
      src,
      default: false,
    });
    captions.push({
      label,
      language,
      fileName: file.name,
    });
  }

  return { tracks, blobUrls, captions };
}

function setPlayerSource(player: Plyr, source: PlayerSourceInfo): HTMLVideoElement | null {
  (player as unknown as { source: PlayerSourceInfo }).source = source;
  return (player as PlyrWithMedia).media ?? null;
}

function setPlayerQualityOptions(player: Plyr, sources: BuiltVideoSource[]) {
  ((player as unknown as { config: Plyr.Options }).config.quality ??= {
    default: sources[0]?.quality ?? 1080,
    options: QUALITY_OPTIONS,
  }).options = buildPlyrQualityOptions(sources);
}

function appendSubtitleTracks(video: HTMLVideoElement, tracks: BuiltSubtitleTrack[]): HTMLTrackElement[] {
  return tracks.map((track) => {
    const trackElement = document.createElement('track');
    trackElement.kind = track.kind;
    trackElement.label = track.label;
    trackElement.srclang = track.srclang;
    trackElement.src = track.src;
    trackElement.default = Boolean(track.default);
    video.appendChild(trackElement);
    return trackElement;
  });
}

function isPlyrReady(player: Plyr): boolean {
  return Boolean((player as PlyrWithInternals).ready);
}

function getAttachedPlyr(video: HTMLVideoElement | null): Plyr | null {
  return (video as HTMLVideoElementWithPlyr | null)?.plyr ?? null;
}

function waitForPlayerReady(player: Plyr): Promise<void> {
  if (isPlyrReady(player)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;

    function cleanup() {
      clearInterval(readyPollTimer);
      clearTimeout(readyTimeoutTimer);
      player.off('ready', handleReady);
    }

    function settle(callback: () => void) {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    }

    function handleReady() {
      settle(resolve);
    }

    function checkReady() {
      if (isPlyrReady(player)) handleReady();
    }

    player.on('ready', handleReady);

    const readyPollTimer = setInterval(checkReady, 50);
    const readyTimeoutTimer = setTimeout(() => {
      if (isPlyrReady(player)) return handleReady();

      settle(() => {
        reject(new Error('Timed out while waiting for Plyr to become ready.'));
      });
    }, PLAYER_READY_TIMEOUT_MS);

    checkReady();
  });
}

export function usePlayer({
  fileId,
  token,
  resourceKey,
  reloadKey = 0,
  onEnded,
  onError,
}: UsePlayerOptions): UsePlayerReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playerInstance, setPlayerInstance] = useState<Plyr | null>(null);
  const [fileMetadata, setFileMetadata] = useState<DriveFile | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(fileId && token));
  const [error, setError] = useState<string | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const destroyPlayerTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const playerRef = useRef<Plyr | null>(null);
  const subtitleBlobUrlsRef = useRef<string[]>([]);
  const localSubtitleBlobUrlsRef = useRef<string[]>([]);
  const localSubtitleTrackElementsRef = useRef<HTMLTrackElement[]>([]);
  const [captionTracks, setCaptionTracks] = useState<PlayerCaptionTrack[]>([]);
  const [localCaptionTracks, setLocalCaptionTracks] = useState<PlayerCaptionTrack[]>([]);
  const [qualitySources, setQualitySources] = useState<PlayerQualitySource[]>([]);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);

  const revokeSubtitleBlobUrls = () => {
    subtitleBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    subtitleBlobUrlsRef.current = [];
  };

  const clearLocalSubtitleTracks = () => {
    localSubtitleTrackElementsRef.current.forEach((trackElement) => trackElement.remove());
    localSubtitleTrackElementsRef.current = [];
    localSubtitleBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localSubtitleBlobUrlsRef.current = [];
    setLocalCaptionTracks([]);
    setSubtitleError(null);
  };

  const addLocalSubtitleFiles = async (files: File[]) => {
    const subtitleFiles = files.filter((file) => isSubtitleExtension(file.name));
    if (subtitleFiles.length === 0) {
      setSubtitleError('Chỉ hỗ trợ file phụ đề .srt hoặc .vtt.');
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setSubtitleError('Trình phát chưa sẵn sàng để thêm phụ đề.');
      return;
    }

    let result: Awaited<ReturnType<typeof buildUploadedSubtitleTracks>>;
    try {
      result = await buildUploadedSubtitleTracks(subtitleFiles);
    } catch {
      setSubtitleError('Không đọc được file phụ đề đã chọn.');
      return;
    }
    if (result.tracks.length === 0) {
      result.blobUrls.forEach((url) => URL.revokeObjectURL(url));
      setSubtitleError('Không đọc được file phụ đề đã chọn.');
      return;
    }

    clearLocalSubtitleTracks();
    localSubtitleBlobUrlsRef.current = result.blobUrls;
    localSubtitleTrackElementsRef.current = appendSubtitleTracks(video, result.tracks);
    setLocalCaptionTracks(result.captions);
    setSubtitleError(null);
  };

  // Initialize Plyr
  useEffect(() => {
    if (destroyPlayerTimerRef.current) {
      clearTimeout(destroyPlayerTimerRef.current);
      destroyPlayerTimerRef.current = undefined;
    }

    const media = videoRef.current;
    if (!media && !playerRef.current) return;
    const usesCoarsePointer = window.matchMedia('(pointer: coarse)').matches;

    const player = playerRef.current ?? getAttachedPlyr(media) ?? (
      // @ts-expect-error - plyr types have conflicting export assignments
      new Plyr(media, {
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
        quality: {
          default: 1080,
          options: QUALITY_OPTIONS,
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
        hideControls: !usesCoarsePointer,
        invertTime: false,
        i18n: PLYR_I18N_VI,
      })
    );

    playerRef.current = player;
    setPlayerInstance(player);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
      revokeSubtitleBlobUrls();
      clearLocalSubtitleTracks();

      destroyPlayerTimerRef.current = setTimeout(() => {
        if (playerRef.current !== player) return;

        player.destroy();
        playerRef.current = null;
        destroyPlayerTimerRef.current = undefined;
      }, 0);
    };
  }, []); // Initialize Plyr only once

  // Load video when fileId or token changes
  useEffect(() => {
    const player = playerRef.current;
    if (!fileId || !token || !player) {
      setIsLoading(false);
      return;
    }
    const activePlayer = player;

    let cancelled = false;
    let cleanupVideoListeners: (() => void) | undefined;
    let cleanupSubtitleTrackElements: (() => void) | undefined;
    let loadTimeout: ReturnType<typeof setTimeout> | undefined;

    const clearLoadTimeout = () => {
      if (loadTimeout) {
        clearTimeout(loadTimeout);
        loadTimeout = undefined;
      }
    };

    async function loadVideo() {
      setIsLoading(true);
      setError(null);
      setFileMetadata(null);
      setCaptionTracks([]);
      clearLocalSubtitleTracks();
      setQualitySources([]);
      revokeSubtitleBlobUrls();

      try {
        const playerReadyPromise = waitForPlayerReady(activePlayer);

        // Fetch metadata
        const metadata = await getFileMetadata(fileId!, token!, resourceKey);
        if (cancelled) return;

        if (!metadata) {
          setError('Không thể tải thông tin video. Kiểm tra quyền truy cập.');
          setIsLoading(false);
          return;
        }

        setFileMetadata(metadata);

        // Update page title
        document.title = `${metadata.name} — ${APP_NAME}`;

        const videoSources = buildVideoSources(metadata, [], resourceKey);
        setQualitySources(toPlayerQualitySources(videoSources));
        const expectedUrls = new Set(
          videoSources.map((source) => new URL(source.src, window.location.href).href)
        );
        let backgroundEnhancementsStarted = false;

        await playerReadyPromise;
        if (cancelled) return;

        setPlayerQualityOptions(activePlayer, videoSources);

        const playerMedia = setPlayerSource(activePlayer, {
          type: 'video',
          title: metadata.name,
          poster: metadata.thumbnailLink,
          sources: videoSources.map((source) => ({
            src: source.src,
            size: source.quality ?? undefined,
          })),
          tracks: [],
        });

        const video = playerMedia ?? videoRef.current;
        if (video) {
          videoRef.current = video;

          const startBackgroundEnhancements = () => {
            if (backgroundEnhancementsStarted || cancelled) return;
            backgroundEnhancementsStarted = true;

            const parentFolderId = metadata.parents?.[0];
            if (!parentFolderId) return;

            void listFolderVideosPage(parentFolderId, token!, {
              pageSize: RELATED_FOLDER_VIDEO_LIMIT,
            }).then((folderVideosResult) => {
              if (cancelled) return;

              const discoveredSources = buildVideoSources(metadata, folderVideosResult?.files ?? [], resourceKey);
              setQualitySources(toPlayerQualitySources(discoveredSources));
            }).catch(() => {
              // Alternate quality sources are optional; keep the current stream running.
            });

            if (cancelled) return;

            void listFolderSubtitleFiles(parentFolderId, token!)
              .then((subtitleFilesResult) => {
                if (cancelled) return;
                return buildSubtitleTracks(metadata, subtitleFilesResult?.files ?? [], token!);
              })
              .then((subtitleTrackResult) => {
                if (!subtitleTrackResult || cancelled || videoRef.current !== video || !isCurrentSource(video, expectedUrls)) {
                  subtitleTrackResult?.blobUrls.forEach((url) => URL.revokeObjectURL(url));
                  return;
                }

                cleanupSubtitleTrackElements?.();
                revokeSubtitleBlobUrls();
                subtitleBlobUrlsRef.current = subtitleTrackResult.blobUrls;
                const appendedTrackElements = appendSubtitleTracks(video, subtitleTrackResult.tracks);
                cleanupSubtitleTrackElements = () => {
                  appendedTrackElements.forEach((trackElement) => trackElement.remove());
                };
                setCaptionTracks(subtitleTrackResult.captions);
              })
              .catch(() => {
                // Captions are optional; video playback should continue without them.
              });
          };

          const markVideoReady = () => {
            if (cancelled) return;
            if (isCurrentSource(video, expectedUrls) && hasLoadedMetadata(video)) {
              clearLoadTimeout();
              setIsLoading(false);
              startBackgroundEnhancements();
            }
          };

          const handleVideoError = () => {
            if (cancelled) return;
            clearLoadTimeout();
            const message = getVideoErrorMessage(video);
            setError(message);
            setIsLoading(false);
            onError?.(message);
          };

          const handleVideoEnded = () => {
            clearPosition(fileId!);
            onEnded?.();
          };

          VIDEO_READY_EVENTS.forEach((eventName) => {
            video.addEventListener(eventName, markVideoReady);
          });
          video.addEventListener('error', handleVideoError);
          video.addEventListener('ended', handleVideoEnded);
          cleanupVideoListeners = () => {
            VIDEO_READY_EVENTS.forEach((eventName) => {
              video.removeEventListener(eventName, markVideoReady);
            });
            video.removeEventListener('error', handleVideoError);
            video.removeEventListener('ended', handleVideoEnded);
          };

          loadTimeout = setTimeout(() => {
            if (cancelled) return;

            if (isCurrentSource(video, expectedUrls) && hasLoadedMetadata(video)) {
              setIsLoading(false);
              startBackgroundEnhancements();
              return;
            }

            const message = `Video chưa tải được metadata sau ${VIDEO_LOAD_TIMEOUT_MS / 1000} giây (${describeVideoState(video)}). File có thể dùng codec không được trình duyệt hỗ trợ hoặc stream bị kẹt ở bước đọc metadata.`;
            setError(message);
            setIsLoading(false);
            onError?.(message);
          }, VIDEO_LOAD_TIMEOUT_MS);

          // Restore position
          const savedPosition = getPosition(fileId!);
          if (savedPosition > 0) {
            video.addEventListener(
              'loadedmetadata',
              () => {
                if (savedPosition < video.duration - 10) {
                  video.currentTime = savedPosition;
                }
              },
              { once: true }
            );
          }

          video.preload = 'metadata';
          video.crossOrigin = 'anonymous';
          markVideoReady();

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
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error && err.message.includes('Plyr')
          ? 'Không thể khởi tạo trình phát video. Hãy tải lại trang rồi thử lại.'
          : 'Lỗi khi tải video';
        setError(message);
        setIsLoading(false);
        onError?.(String(err));
      }
    }

    loadVideo();

    return () => {
      cancelled = true;
      clearLoadTimeout();
      cleanupVideoListeners?.();
      cleanupSubtitleTrackElements?.();
      revokeSubtitleBlobUrls();
      clearLocalSubtitleTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, token, resourceKey, reloadKey]);

  return {
    videoRef,
    player: playerInstance,
    fileMetadata,
    captionTracks,
    localCaptionTracks,
    qualitySources,
    isLoading,
    error,
    subtitleError,
    addLocalSubtitleFiles,
    clearLocalSubtitleTracks,
  };
}
