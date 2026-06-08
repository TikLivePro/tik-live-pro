export type VideoSourceType = 'camera' | 'local-file' | 'online-url';

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
  loadError: string | null;
  recentSources: RecentSource[];
  videoVolume: number;
  loadLocalFile: (file: File) => void;
  loadOnlineUrl: (url: string) => void;
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
}
