declare module 'plyr' {
  export default class Plyr {
    constructor(target: HTMLElement | string, options?: Plyr.Options);
    
    readonly playing: boolean;
    readonly paused: boolean;
    readonly stopped: boolean;
    readonly ended: boolean;
    readonly buffered: number;
    readonly currentTime: number;
    readonly duration: number;
    readonly volume: number;
    readonly muted: boolean;
    readonly speed: number;
    readonly quality: number;
    readonly loop: boolean;
    readonly fullscreen: { active: boolean; enabled: boolean; enter(): void; exit(): void; toggle(): void };
    readonly pip: boolean;
    source: Plyr.SourceInfo;
    poster: string;
    autoplay: boolean;
    
    play(): Promise<void>;
    pause(): void;
    stop(): void;
    restart(): void;
    rewind(seekTime?: number): void;
    forward(seekTime?: number): void;
    togglePlay(toggle?: boolean): void;
    toggleCaptions(toggle?: boolean): void;
    toggleControls(toggle?: boolean): void;
    
    on(event: string, callback: (...args: unknown[]) => void): void;
    once(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback: (...args: unknown[]) => void): void;
    
    supports(type: string): boolean;
    destroy(): void;
  }

  namespace Plyr {
    interface Options {
      enabled?: boolean;
      debug?: boolean;
      controls?: string[] | HTMLElement;
      settings?: string[];
      i18n?: Record<string, unknown>;
      loadSprite?: boolean;
      iconUrl?: string;
      iconPrefix?: string;
      blankVideo?: string;
      autoplay?: boolean;
      autopause?: boolean;
      playsinline?: boolean;
      seekTime?: number;
      volume?: number;
      muted?: boolean;
      clickToPlay?: boolean;
      disableContextMenu?: boolean;
      hideControls?: boolean;
      resetOnEnd?: boolean;
      keyboard?: { focused?: boolean; global?: boolean };
      tooltips?: { controls?: boolean; seek?: boolean };
      duration?: number;
      displayDuration?: boolean;
      invertTime?: boolean;
      toggleInvert?: boolean;
      captions?: { active?: boolean; language?: string; update?: boolean };
      fullscreen?: { enabled?: boolean; fallback?: boolean; iosNative?: boolean };
      ratio?: string;
      storage?: { enabled?: boolean; key?: string };
      speed?: { selected?: number; options?: number[] };
      quality?: { default?: number; options?: number[]; forced?: boolean; onChange?: (quality: number) => void };
      loop?: { active?: boolean };
      ads?: { enabled?: boolean; publisherId?: string; tagUrl?: string };
      urls?: Record<string, string>;
      previewThumbnails?: { enabled?: boolean; src?: string | string[] };
      mediaMetadata?: Record<string, unknown>;
      markers?: { enabled?: boolean; points?: { time: number; label: string }[] };
      listeners?: Record<string, (...args: unknown[]) => void>;
    }

    interface SourceInfo {
      type: string;
      title?: string;
      sources: Source[];
      poster?: string;
      tracks?: Track[];
    }

    interface Source {
      src: string;
      type?: string;
      provider?: string;
      size?: number;
    }

    interface Track {
      kind: string;
      label: string;
      srcLang?: string;
      src: string;
      default?: boolean;
    }
  }

  export = Plyr;
}

declare module 'plyr/dist/plyr.css';
