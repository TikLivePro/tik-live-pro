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

// Prevent createMediaElementSource from being called twice on the same element
// (React Strict Mode double-invokes effects; the second call throws).
// Using a WeakSet so elements are GC-eligible after unmount.
const mediaSourcedElements = new WeakSet<HTMLVideoElement>();

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

  // Web Audio API nodes for audio capture — lets us send video audio to WebRTC
  // while keeping the video element muted locally (no echo for the streamer).
  // createMediaElementSource can only be called once per element per context,
  // so we create it once on mount and reuse it across source changes.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  // GainNode for local monitoring — controls how much the streamer hears
  const monitorGainRef = useRef<GainNode | null>(null);
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

    // captureStream() for the video track only — called while the element may still be
    // muted by JSX, which is fine because we use the Web Audio API for the audio track.
    try {
      capturedStreamRef.current = (video as CaptureableVideo).captureStream();
    } catch {
      capturedStreamRef.current = null;
    }

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
        // play() is called from loadeddata which fires after the user picked a file or
        // typed a URL (sticky user activation), so it succeeds without muted.
        // Do NOT gate play() on ctx.resume() — AudioContext.resume() requires a user
        // gesture and may never resolve in an async chain, causing permanent black screen.
        // Resume the AudioContext separately (fire-and-forget) for audio routing.
        void video.play().catch((err) => {
          console.warn('[useVideoShare] video.play() failed:', err);
        });
        audioCtxRef.current?.resume().catch(() => {});
      }
    };
    const onError = (): void => {
      const err = video.error;
      let msg = 'Impossible de charger la vidéo.';
      if (err) {
        switch (err.code) {
          case MediaError.MEDIA_ERR_NETWORK:
            msg =
              video.crossOrigin === 'anonymous'
                ? 'Erreur réseau — le serveur ne renvoie pas les en-têtes CORS requis. Utilisez une URL hébergée avec CORS activé.'
                : "Erreur réseau — vérifiez que l'URL est accessible.";
            break;
          case MediaError.MEDIA_ERR_DECODE:
            msg = 'Format non supporté ou fichier corrompu.';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            msg =
              video.crossOrigin === 'anonymous'
                ? 'URL inaccessible ou CORS non autorisé. Le serveur doit envoyer "Access-Control-Allow-Origin: *".'
                : 'Format vidéo non supporté par le navigateur.';
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

    // Set up Web Audio API for audio capture — only once per video element.
    // mediaSourcedElements guards against React Strict Mode double-invocation where
    // the second createMediaElementSource() call would throw because the element is
    // already connected to the (now-closed) AudioContext from the first run.
    if (!mediaSourcedElements.has(video)) {
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();
        audioDestRef.current = dest;
        const monitorGain = ctx.createGain();
        monitorGainRef.current = monitorGain;
        monitorGain.gain.value = videoVolumeRef.current / 100;

        // Per the Web Audio spec, a muted element causes MediaElementAudioSourceNode
        // to produce silence — neither the WebRTC track nor local monitoring would have
        // any audio. Unmute before connecting so the node captures actual audio data.
        // Once createMediaElementSource() is called, Web Audio takes over the element's
        // audio routing entirely; the element no longer drives speakers directly, so
        // local playback volume is controlled solely by monitorGain below.
        video.muted = false;
        video.removeAttribute('muted');

        const src = ctx.createMediaElementSource(video);
        src.connect(dest); // → WebRTC (viewers)
        src.connect(monitorGain); // → streamer local monitoring
        monitorGain.connect(ctx.destination);
        mediaSourcedElements.add(video);
      } catch {
        // AudioContext unavailable (SSR, sandboxed iframe, etc.)
      }
    }

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
      // Do not close the AudioContext here — the mediaSourcedElements guard ensures
      // createMediaElementSource is only called once, so we keep the context alive
      // across Strict Mode's fake unmount/remount cycle. True cleanup happens on GC.
    };
  }, []);

  const getVideoTrack = useCallback((): MediaStreamTrack | null => {
    if (sourceTypeRef.current === 'camera') return null;
    return capturedStreamRef.current?.getVideoTracks()[0] ?? null;
  }, []);

  const getAudioTrack = useCallback((): MediaStreamTrack | null => {
    if (sourceTypeRef.current === 'camera') return null;
    // Audio comes from the Web Audio API destination node, not from captureStream().
    // The muted video element prevents captureStream() from including audio tracks.
    return audioDestRef.current?.stream.getAudioTracks()[0] ?? null;
  }, []);

  const loadLocalFile = useCallback((file: File): void => {
    const video = videoRef.current;
    if (!video) return;
    if (video.src?.startsWith('blob:')) URL.revokeObjectURL(video.src);
    video.removeAttribute('crossorigin');
    video.src = URL.createObjectURL(file);
    pendingPlayRef.current = true;
    video.load();

    // Resume AudioContext — user just interacted (file picker), so the browser allows it
    void audioCtxRef.current?.resume();

    setLoadError(null);
    setSourceType('local-file');
    setIsVideoLoaded(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

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
    // crossOrigin required so captureStream() can read cross-origin frames without taint.
    video.crossOrigin = 'anonymous';
    video.src = url;
    pendingPlayRef.current = true;
    video.load();

    void audioCtxRef.current?.resume();

    setLoadError(null);
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
    pendingPlayRef.current = false;
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
    // Play immediately — the element is muted so no user gesture is required.
    // Resume the AudioContext separately; gating play() on ctx.resume() causes
    // permanent black screen when the AudioContext hasn't been resumed yet.
    void video.play().catch((err) => {
      console.warn('[useVideoShare] video.play() failed:', err);
    });
    audioCtxRef.current?.resume().catch(() => {});
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
    if (monitorGainRef.current) {
      monitorGainRef.current.gain.value = clamped / 100;
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
  };
}
