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

  // captureStream() is called once at mount and stays bound to the element for its
  // lifetime. The stream automatically reflects whichever file is currently playing —
  // WHIP only needs a single replaceTrack() per source-type switch, not per file.
  //
  // The <video> element carries the `muted` attribute to suppress local speaker output.
  // However, captureStream() on a muted element does NOT capture audio tracks. To work
  // around this, we use Web Audio API: createMediaElementSource() routes the video audio
  // to a MediaStreamAudioDestinationNode, giving us an audio track for WebRTC while
  // keeping the video silent locally (by not connecting to audioContext.destination).
  const capturedStreamRef = useRef<MediaStream | null>(null);

  // Local monitor volume — applied directly to video.volume so the streamer hears
  // the video through the browser's normal audio output. We intentionally do NOT
  // use createMediaElementSource / Web Audio here: the Web Audio spec mandates that
  // a MediaElementAudioSourceNode outputs silence for cross-origin resources that
  // lack CORS headers (e.g. yt-dlp-resolved CDN URLs), which would mute the streamer.
  // Using video.volume avoids this restriction; captureStream() provides the audio
  // track for WebRTC (same-origin files carry audio; non-CORS CDN URLs are a browser
  // limitation — viewers would need a server-side media proxy for audio in that case).
  const videoVolumeRef = useRef(50);

  // Set true in loadLocalFile/loadOnlineUrl; cleared by onLoadedData after play() fires.
  // Intentionally NOT reset in cleanup so the flag survives React Strict Mode's remount.
  const pendingPlayRef = useRef(false);

  const [sourceType, setSourceType] = useState<VideoSourceType>('camera');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [allowViewerControl, setAllowViewerControlState] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [bufferedAhead, setBufferedAhead] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recentSources, setRecentSources] = useState<RecentSource[]>(loadSavedUrls);
  const [videoVolume, setVideoVolumeState] = useState(50);
  const [videoLoadKey, setVideoLoadKey] = useState(0);
  // true when it is safe to draw the current source onto a canvas (same-origin blob:
  // files, or online URLs whose CDN returned CORS headers).
  const [corsAvailable, setCorsAvailable] = useState(false);

  const allowViewerControlRef = useRef(false);
  const sourceTypeRef = useRef<VideoSourceType>('camera');

  useEffect(() => {
    sourceTypeRef.current = sourceType;
  }, [sourceType]);
  useEffect(() => {
    allowViewerControlRef.current = allowViewerControl;
  }, [allowViewerControl]);

  // Attach event listeners and capture the element's output stream at mount.
  // captureStream() must run before any src is loaded so the track identity is stable
  // for WHIP — the same track object carries frames from every subsequent file change.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    try {
      capturedStreamRef.current = (video as CaptureableVideo).captureStream();
    } catch {
      capturedStreamRef.current = null;
    }
    // Set initial monitor volume so the streamer hears audio at 50% from the first load.
    video.volume = videoVolumeRef.current / 100;

    function getBufferedAhead(el: HTMLVideoElement): number {
      const { buffered, currentTime } = el;
      for (let i = 0; i < buffered.length; i++) {
        if (buffered.start(i) <= currentTime + 0.5 && buffered.end(i) > currentTime) {
          return Math.max(0, buffered.end(i) - currentTime);
        }
      }
      return 0;
    }

    const onTimeUpdate = (): void => setCurrentTime(video.currentTime);
    const onDurationChange = (): void => setDuration(isFinite(video.duration) ? video.duration : 0);
    const onPlay = (): void => setIsPlaying(true);
    const onPause = (): void => setIsPlaying(false);
    const onEnded = (): void => setIsPlaying(false);
    const onProgress = (): void => setBufferedAhead(getBufferedAhead(video));
    const onCanPlay = (): void => setBufferedAhead(getBufferedAhead(video));
    const onLoadedData = (): void => {
      // Re-capture the stream so getVideoTrack() returns a live track for the new source.
      // After video.load(), the previous captureStream() track can be in a no-data state;
      // a fresh capture gives WebRTC a healthy track to replace with.
      try {
        capturedStreamRef.current = (video as CaptureableVideo).captureStream();
      } catch {
        // ignore — capturedStreamRef keeps the old stream if recapture fails
      }
      setVideoLoadKey((k) => k + 1);
      setIsVideoLoaded(true);
      setLoadError(null);
      setDuration(isFinite(video.duration) ? video.duration : 0);
      // Defer play() to here instead of calling it right after load() — avoids the
      // "play() interrupted by new load request" AbortError on source changes.
      if (pendingPlayRef.current) {
        pendingPlayRef.current = false;
        void video.play().catch((err) => {
          console.warn('[useVideoShare] video.play() failed:', err);
        });
      }
    };
    const onError = (): void => {
      const err = video.error;
      let msg = 'Impossible de charger la vidéo.';
      if (err) {
        switch (err.code) {
          case MediaError.MEDIA_ERR_NETWORK:
            msg = "Erreur réseau — vérifiez que l'URL est accessible.";
            break;
          case MediaError.MEDIA_ERR_DECODE:
            msg = 'Format non supporté ou fichier corrompu.';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            msg = 'Format vidéo non supporté ou URL inaccessible.';
            break;
          default:
            msg = `Erreur de lecture (code ${err.code}).`;
        }
      }
      setLoadError(msg);
      setIsVideoLoaded(false);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('error', onError);
    video.addEventListener('progress', onProgress);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('canplaythrough', onCanPlay);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('error', onError);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('canplaythrough', onCanPlay);
    };
  }, []);

  const getVideoTrack = useCallback((): MediaStreamTrack | null => {
    if (sourceTypeRef.current === 'camera') return null;
    return capturedStreamRef.current?.getVideoTracks()[0] ?? null;
  }, []);

  const getAudioTrack = useCallback((): MediaStreamTrack | null => {
    if (sourceTypeRef.current === 'camera') return null;
    return capturedStreamRef.current?.getAudioTracks()[0] ?? null;
  }, []);

  const loadLocalFile = useCallback((file: File): void => {
    const video = videoRef.current;
    if (!video) return;
    if (video.src?.startsWith('blob:')) URL.revokeObjectURL(video.src);
    video.removeAttribute('crossorigin');
    video.src = URL.createObjectURL(file);
    pendingPlayRef.current = true;
    video.load();

    setLoadError(null);
    setSourceType('local-file');
    setIsVideoLoaded(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    // blob: URLs are same-origin — the canvas compositor can draw them safely.
    setCorsAvailable(true);

    const entry: RecentSource = {
      id: crypto.randomUUID(),
      type: 'local-file',
      name: file.name,
      file,
    };
    setRecentSources((prev) => {
      const deduped = prev.filter((s) => s.type !== 'local-file' || s.name !== file.name);
      return [entry, ...deduped].slice(0, MAX_RECENT);
    });
  }, []);

  const loadOnlineUrl = useCallback((url: string): void => {
    const video = videoRef.current;
    if (!video) return;
    if (video.src?.startsWith('blob:')) URL.revokeObjectURL(video.src);
    // Route through the same-origin proxy so captureStream() captures real frames.
    // Direct cross-origin URLs produce opaque (black) video tracks and silent audio
    // tracks in Chromium; the proxy makes the resource appear same-origin, which
    // removes the browser's taint restriction and enables the canvas compositor too.
    video.removeAttribute('crossorigin');
    video.src = `/api/video-stream?url=${encodeURIComponent(url)}`;
    pendingPlayRef.current = true;
    video.load();

    setLoadError(null);
    setSourceType('online-url');
    setIsVideoLoaded(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    // Proxy URL is same-origin → canvas compositor can draw it safely.
    setCorsAvailable(true);

    const entry: RecentSource = { id: url, type: 'online-url', name: url, url };
    setRecentSources((prev) => {
      const deduped = prev.filter((s) => s.id !== url);
      const next = [entry, ...deduped].slice(0, MAX_RECENT);
      persistUrls(next);
      return next;
    });
  }, []);

  const switchToCamera = useCallback((): void => {
    pendingPlayRef.current = false;
    setCorsAvailable(false);
    const video = videoRef.current;
    if (video) {
      video.pause();
      if (video.src?.startsWith('blob:')) URL.revokeObjectURL(video.src);
      video.removeAttribute('src');
      video.load();
    }
    setLoadError(null);
    setSourceType('camera');
    setIsVideoLoaded(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const play = useCallback((): void => {
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch((err) => {
      console.warn('[useVideoShare] video.play() failed:', err);
    });
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

  const setVideoVolume = useCallback((volume: number): void => {
    const clamped = Math.max(0, Math.min(100, volume));
    videoVolumeRef.current = clamped;
    setVideoVolumeState(clamped);
    const video = videoRef.current;
    if (video) {
      video.volume = clamped / 100;
    }
  }, []);

  // Register as streamer and handle incoming viewer control commands.
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
    return () => {
      socket.off('video_control_command', handleCommand);
    };
  }, [socketRef, sessionId, sourceType, play, pause, seek, setSpeed]);

  // Broadcast video state to viewers on change and on a 2 s heartbeat.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !sessionId) return;

    if (sourceType === 'camera') {
      socket.emit('video_state', { sourceType: 'camera' });
      return;
    }

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
    // Proactive check: show as buffering whenever the lookahead drops below 5 s while
    // playing and there is still meaningful content ahead (avoids false positives near EOF).
    isBuffering:
      isVideoLoaded &&
      isPlaying &&
      sourceType !== 'camera' &&
      duration - currentTime > 5 &&
      bufferedAhead < 5,
    bufferedAhead,
    loadError,
    recentSources,
    videoVolume,
    loadLocalFile,
    loadOnlineUrl,
    switchToCamera,
    play,
    pause,
    seek,
    setSpeed,
    setAllowViewerControl,
    setVideoVolume,
    getVideoTrack,
    getAudioTrack,
    videoLoadKey,
    isCorsAvailable: corsAvailable,
  };
}
