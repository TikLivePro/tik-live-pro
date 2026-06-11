export type VideoSourceType = 'camera' | 'local-file' | 'online-url';

export interface PlatformVideoContext {
  /** Original platform URL (YouTube, Twitch…) — used to re-resolve after CDN expiry or quality switch. */
  platformUrl: string;
  /** All available video heights from the last resolve, sorted descending. */
  availableHeights: number[];
  /** Currently selected height; 0 means "auto / best". */
  selectedHeight: number;
}

export type VideoControlType = 'play' | 'pause' | 'seek' | 'speed';

export interface VideoControlCommand {
  type: VideoControlType;
  currentTime?: number;
  speed?: number;
}

export type RecentSource =
  | { id: string; type: 'local-file'; name: string; file: File }
  | { id: string; type: 'online-url'; name: string; url: string };

export interface VideoShareResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  sourceType: VideoSourceType;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  allowViewerControl: boolean;
  isVideoLoaded: boolean;
  isBuffering: boolean;
  /** True while a quality/URL switch is in progress — suppresses "paused" UI. */
  isQualitySwitching: boolean;
  bufferedAhead: number;
  /** All buffered time ranges reported by the browser — may be non-contiguous after seeks. */
  bufferedRanges: Array<{ start: number; end: number }>;
  loadError: string | null;
  recentSources: RecentSource[];
  videoVolume: number;
  loadLocalFile: (file: File) => void;
  loadOnlineUrl: (url: string) => void;
  /**
   * Swaps to a new online URL without resetting the playback UI state.
   * Use for quality/resolution switches where the stream should keep "playing"
   * visually during the brief reload gap.
   */
  switchOnlineUrl: (url: string) => void;
  switchToCamera: () => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setSpeed: (rate: number) => void;
  setAllowViewerControl: (allow: boolean) => void;
  setVideoVolume: (volume: number) => void;
  getVideoTrack: () => MediaStreamTrack | null;
  getAudioTrack: () => MediaStreamTrack | null;
  videoLoadKey: number;
  // true when the current source is safe to draw onto a canvas (same-origin blob: or
  // an online URL whose CDN returned CORS headers). False for CDN URLs that don't support
  // CORS (e.g. YouTube googlevideo.com) — the compositor PiP is skipped in that case.
  isCorsAvailable: boolean;
  /** The effective URL currently loaded into the video element (null when camera or no URL loaded). */
  effectiveUrl: string | null;
}
