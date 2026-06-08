'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  VideoSourceType,
  VideoShareResult,
  VideoControlCommand,
  RecentSource,
} from '../interfaces/video-share.interfaces';

type CaptureableVideo = HTMLVideoElement & { captureStream(): MediaStream };

const RECENT_URL_KEY = 'tiklivepro:video:recentUrls';
const MAX_RECENT = 50;

function loadSavedUrls(): RecentSource[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_URL_KEY);
    if (!raw) return [];
    const urls: string[] = JSON.parse(raw);
    return urls.map((url) => ({ id: url, type: 'online-url' as const, name: url, url }));
  } catch {
    return [];
  }
}

function persistUrls(sources: RecentSource[]): void {
  try {
    const urls = sources
      .filter((s): s is Extract<RecentSource, { type: 'online-url' }> => s.type === 'online-url')
      .map((s) => s.url)
      .slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_URL_KEY, JSON.stringify(urls));
  } catch {
    // localStorage might be unavailable
  }
}

interface UseVideoShareOptions {
  socketRef: MutableRefObject<Socket | null>;
  sessionId: string | null;
}

export function useVideoShare({ socketRef, sessionId }: UseVideoShareOptions): VideoShareResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const capturedStreamRef = useRef<MediaStream | null>(null);

  // Web Audio API nodes for audio capture — lets us send video audio to WebRTC
  // while keeping the video element muted locally (no echo for the streamer).
  // createMediaElementSource can only be called once per element per context,
  // so we create it once on mount and reuse it across source changes.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const [sourceType, setSourceType] = useState<VideoSourceType>('camera');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [allowViewerControl, setAllowViewerControlState] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [recentSources, setRecentSources] = useState<RecentSource[]>(loadSavedUrls);

  const allowViewerControlRef = useRef(false);
  const sourceTypeRef = useRef<VideoSourceType>('camera');

  useEffect(() => { sourceTypeRef.current = sourceType; }, [sourceType]);
  useEffect(() => { allowViewerControlRef.current = allowViewerControl; }, [allowViewerControl]);

  // Wire up video element events and Web Audio API
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = (): void => setCurrentTime(video.currentTime);
    const onDurationChange = (): void => setDuration(isFinite(video.duration) ? video.duration : 0);
    const onPlay = (): void => setIsPlaying(true);
    const onPause = (): void => setIsPlaying(false);
    const onEnded = (): void => setIsPlaying(false);
    const onLoadedData = (): void => {
      setIsVideoLoaded(true);
      setDuration(isFinite(video.duration) ? video.duration : 0);
      // Auto-play so the captureStream() track immediately produces frames for viewers.
      // captureStream() sends 0 fps while the video is paused — viewers see black until playback starts.
      void video.play().catch(() => {});
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('loadeddata', onLoadedData);

    // Set up Web Audio API for audio capture.
    // By routing video audio through a MediaStreamDestinationNode (without connecting
    // to AudioContext.destination), we capture audio for WebRTC while keeping the
    // video element silent locally — regardless of the `muted` HTML attribute.
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      audioDestRef.current = dest;
      const src = ctx.createMediaElementSource(video);
      src.connect(dest);
      // Intentionally NOT connecting src → ctx.destination: no local playback
    } catch {
      // AudioContext unavailable (SSR, sandboxed iframe, etc.)
    }

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('loadeddata', onLoadedData);
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      audioDestRef.current = null;
    };
  }, []);

  const getVideoTrack = useCallback((): MediaStreamTrack | null => {
    if (sourceTypeRef.current === 'camera') return null;
    return capturedStreamRef.current?.getVideoTracks()[0] ?? null;
  }, []);

  const getAudioTrack = useCallback((): MediaStreamTrack | null => {
    if (sourceTypeRef.current === 'camera') return null;
    return audioDestRef.current?.stream.getAudioTracks()[0] ?? null;
  }, []);

  const loadLocalFile = useCallback((file: File): void => {
    const video = videoRef.current;
    if (!video) return;
    if (video.src?.startsWith('blob:')) URL.revokeObjectURL(video.src);
    video.removeAttribute('crossorigin');
    video.src = URL.createObjectURL(file);
    video.load();
    try {
      capturedStreamRef.current = (video as CaptureableVideo).captureStream();
    } catch {
      capturedStreamRef.current = null;
    }
    // Resume AudioContext — user just interacted (file picker), so the browser allows it
    void audioCtxRef.current?.resume();
    setSourceType('local-file');
    setIsVideoLoaded(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const entry: RecentSource = { id: crypto.randomUUID(), type: 'local-file', name: file.name, file };
    setRecentSources((prev) => {
      const deduped = prev.filter((s) => s.type !== 'local-file' || s.name !== file.name);
      return [entry, ...deduped].slice(0, MAX_RECENT);
    });
  }, []);

  const loadOnlineUrl = useCallback((url: string): void => {
    const video = videoRef.current;
    if (!video) return;
    if (video.src?.startsWith('blob:')) URL.revokeObjectURL(video.src);
    // crossOrigin required for captureStream() on external URLs (avoids canvas taint).
    // The server must respond with CORS headers; if not, captureStream() will throw SecurityError.
    video.crossOrigin = 'anonymous';
    video.src = url;
    video.load();
    try {
      capturedStreamRef.current = (video as CaptureableVideo).captureStream();
    } catch {
      capturedStreamRef.current = null;
    }
    void audioCtxRef.current?.resume();
    setSourceType('online-url');
    setIsVideoLoaded(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const entry: RecentSource = { id: url, type: 'online-url', name: url, url };
    setRecentSources((prev) => {
      const deduped = prev.filter((s) => s.id !== url);
      const next = [entry, ...deduped].slice(0, MAX_RECENT);
      persistUrls(next);
      return next;
    });
  }, []);

  const switchToCamera = useCallback((): void => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      if (video.src?.startsWith('blob:')) URL.revokeObjectURL(video.src);
      video.removeAttribute('src');
      video.load();
    }
    capturedStreamRef.current = null;
    setSourceType('camera');
    setIsVideoLoaded(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const play = useCallback((): void => {
    videoRef.current?.play().catch(() => {});
  }, []);

  const pause = useCallback((): void => {
    videoRef.current?.pause();
  }, []);

  const seek = useCallback((time: number): void => {
    const video = videoRef.current;
    if (video) video.currentTime = time;
  }, []);

  const setSpeed = useCallback((rate: number): void => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
  }, []);

  const setAllowViewerControl = useCallback((allow: boolean): void => {
    allowViewerControlRef.current = allow;
    setAllowViewerControlState(allow);
  }, []);

  // Register as streamer and handle incoming viewer control commands
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !sessionId || sourceType === 'camera') return;

    socket.emit('join_as_streamer');

    const handleCommand = (data: VideoControlCommand): void => {
      if (!allowViewerControlRef.current) return;
      if (data.type === 'play') play();
      else if (data.type === 'pause') pause();
      else if (data.type === 'seek' && data.currentTime !== undefined) seek(data.currentTime);
      else if (data.type === 'speed' && data.speed !== undefined) setSpeed(data.speed);
    };

    socket.on('video_control_command', handleCommand);
    return () => { socket.off('video_control_command', handleCommand); };
  }, [socketRef, sessionId, sourceType, play, pause, seek, setSpeed]);

  // Broadcast video state to viewers (on change and on interval)
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !sessionId || sourceType === 'camera') return;

    socket.emit('video_state', { playing: isPlaying, currentTime, duration, allowViewerControl });

    const interval = setInterval(() => {
      socketRef.current?.emit('video_state', {
        playing: isPlaying,
        currentTime: videoRef.current?.currentTime ?? currentTime,
        duration,
        allowViewerControl: allowViewerControlRef.current,
      });
    }, 2000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, sourceType, isPlaying, duration, allowViewerControl]);

  return {
    videoRef,
    sourceType,
    isPlaying,
    currentTime,
    duration,
    allowViewerControl,
    isVideoLoaded,
    recentSources,
    loadLocalFile,
    loadOnlineUrl,
    switchToCamera,
    play,
    pause,
    seek,
    setSpeed,
    setAllowViewerControl,
    getVideoTrack,
    getAudioTrack,
  };
}
