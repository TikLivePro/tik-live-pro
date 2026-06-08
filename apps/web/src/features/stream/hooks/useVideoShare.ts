'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { Socket } from 'socket.io-client';
import type { VideoSourceType, VideoShareResult, VideoControlCommand } from '../interfaces/video-share.interfaces';

type CaptureableVideo = HTMLVideoElement & { captureStream(): MediaStream };

interface UseVideoShareOptions {
  socketRef: MutableRefObject<Socket | null>;
  sessionId: string | null;
}

export function useVideoShare({ socketRef, sessionId }: UseVideoShareOptions): VideoShareResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const capturedStreamRef = useRef<MediaStream | null>(null);

  const [sourceType, setSourceType] = useState<VideoSourceType>('camera');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [allowViewerControl, setAllowViewerControlState] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const allowViewerControlRef = useRef(false);
  const sourceTypeRef = useRef<VideoSourceType>('camera');

  useEffect(() => { sourceTypeRef.current = sourceType; }, [sourceType]);
  useEffect(() => { allowViewerControlRef.current = allowViewerControl; }, [allowViewerControl]);

  // Wire up video element events
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
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('loadeddata', onLoadedData);
    };
  }, []);

  const getVideoTrack = useCallback((): MediaStreamTrack | null => {
    if (sourceTypeRef.current === 'camera') return null;
    return capturedStreamRef.current?.getVideoTracks()[0] ?? null;
  }, []);

  const loadLocalFile = useCallback((file: File): void => {
    const video = videoRef.current;
    if (!video) return;
    if (video.src?.startsWith('blob:')) URL.revokeObjectURL(video.src);
    // Blob URLs are always same-origin — no crossOrigin needed and setting it can
    // cause unnecessary preflight requests in some browsers.
    video.removeAttribute('crossorigin');
    video.src = URL.createObjectURL(file);
    video.load();
    try {
      capturedStreamRef.current = (video as CaptureableVideo).captureStream();
    } catch {
      capturedStreamRef.current = null;
    }
    setSourceType('local-file');
    setIsVideoLoaded(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
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
    setSourceType('online-url');
    setIsVideoLoaded(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
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
    loadLocalFile,
    loadOnlineUrl,
    switchToCamera,
    play,
    pause,
    seek,
    setSpeed,
    setAllowViewerControl,
    getVideoTrack,
  };
}
