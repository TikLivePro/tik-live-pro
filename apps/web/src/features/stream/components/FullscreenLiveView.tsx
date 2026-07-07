'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { API_BASE, apiFetch, buildMergeStreamUrl, resolveVideoProxyUrl } from '@/lib/api';
import { useStream } from '../hooks/useStream';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { useCameraStream } from '../hooks/useCameraStream';
import { useWhipStream } from '../hooks/useWhipStream';
import { useStreamStore } from '../store/stream.store';
import {
  getVideoQualityPreset,
  REACTION_EMOJIS,
  VIDEO_QUALITY_PRESETS,
  type VideoQualityPreset,
} from '../consts/stream.consts';
import { useComments } from '@/features/comments/hooks/useComments';
import { useRecording } from '../hooks/useRecording';
import { useVideoShare } from '../hooks/useVideoShare';
import { useWebcamAvailability } from '../hooks/useWebcamAvailability';
import type { LiveSession, LiveSessionId } from '@tik-live-pro/shared-types';
import { LiveReactionFloat } from './LiveReactionFloat';
import { MinimizedPlayer } from './MinimizedPlayer';
import { LiveCommentPanel } from './LiveCommentPanel';
import { ViewersPanel } from './ViewersPanel';
import { VideoSourcePicker } from './VideoSourcePicker';
import { VideoSharePlayer } from './VideoSharePlayer';
import { PlaylistPanel } from './PlaylistPanel';
import { usePlaylist } from '../hooks/usePlaylist';
import { LiveStatusBar } from './LiveStatusBar';
import { LiveStatsStrip } from './LiveStatsStrip';
import { StreamSettingsRow } from './StreamSettingsRow';
import { StreamLinksCard } from './StreamLinksCard';
import { StickyEndStreamBar } from './StickyEndStreamBar';
import { EndStreamDialog } from './EndStreamDialog';

// Shared glass token for overlay chips on the monitor
const GLASS_PILL =
  'bg-black/45 backdrop-blur-xl border border-white/20 text-white transition-colors';

type RailTab = 'chat' | 'viewers';

export function FullscreenLiveView(): React.ReactElement {
  const t = useTranslations('stream');
  const router = useRouter();
  const { currentSession, isEnding, isPausing, endSession, pauseSession, resumeSession } =
    useStream();
  const {
    comments,
    commentCount,
    reactionCount,
    liveReactions,
    addReaction,
    removeReaction,
    videoQualityId,
    setVideoQualityId,
    preSource,
    setPreSource,
    prePlaylist,
    setPrePlaylist,
    platformVideoContext,
    setPlatformVideoContext,
    hydratePlatformVideoContext,
  } = useStreamStore();
  const isPaused = currentSession?.status === 'paused';
  const { hasWebcam } = useWebcamAvailability();
  const {
    videoRef,
    state: cameraState,
    isMicMuted,
    isCameraOff,
    micVolume,
    speakerVolume,
    start: startCamera,
    toggleMic,
    toggleCamera,
    setMicVolume,
    setSpeakerVolume,
    getStream,
  } = useCameraStream(true);

  const { sendComment, replyToComment, emitReaction, isSending, socketRef } = useComments(
    currentSession?.id ?? null,
  );
  // Stable ref so the onVideoEnded callback (captured at hook-mount time) can reach
  // the playlist's playNext without a stale closure over the playlist object.
  const playlistRef = useRef<{ playNext: () => void } | null>(null);
  const videoShare = useVideoShare({
    socketRef,
    sessionId: currentSession?.id ?? null,
    onVideoEnded: () => { playlistRef.current?.playNext(); },
  });
  const {
    state: whipState,
    connect: connectWhip,
    disconnect: disconnectWhip,
    replaceVideoTrack,
    replaceAudioTrack,
    setVideoBitrate,
  } = useWhipStream();

  const playlist = usePlaylist({
    onLoadItem: (item) => {
      if (item.type === 'local-file' && item.file) videoShare.loadLocalFile(item.file);
      else if (item.type === 'online-url' && item.url) videoShare.loadOnlineUrl(item.url);
    },
  });
  // keep the ref in sync so the onVideoEnded callback inside useVideoShare can call playNext
  playlistRef.current = playlist;
  const {
    isRecording,
    isToggling: isTogglingRecording,
    toggle: toggleRecording,
  } = useRecording((currentSession?.id as LiveSessionId) ?? null);

  const [whipRetryTrigger, setWhipRetryTrigger] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [railTab, setRailTab] = useState<RailTab>('chat');
  const [endDialogOpen, setEndDialogOpen] = useState(false);

  const isLive = currentSession?.status === 'live';
  const isStarting = currentSession?.status === 'starting';
  const elapsed = useElapsedTime(isLive ? (currentSession?.startedAt ?? null) : null);
  const destinations = (currentSession?.destinations ?? []).filter(
    (d) => d.platform !== 'platform',
  );
  const platformHlsUrl = currentSession?.platformHlsUrl ?? null;
  const platformWhepUrl = ((): string | null => {
    if (!platformHlsUrl) return null;
    try {
      const { pathname } = new URL(platformHlsUrl);
      const key = pathname.split('/live/')[1]?.split('/')[0];
      if (!key) return null;
      const base = process.env.NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL ?? 'http://localhost:8889';
      return `${base}/live/${key}/whep`;
    } catch {
      return null;
    }
  })();

  // Poll session status while starting — backend only transitions to 'live' after
  // the RTMP ingest receives a stream, which is asynchronous.
  const setSessionInStore = useStreamStore((s) => s.setSession);
  useEffect(() => {
    if (!currentSession?.id) return;
    if (currentSession.status !== 'starting') return;

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`${API_BASE}/sessions/${currentSession.id}`);
        if (!res.ok) return;
        const { data } = (await res.json()) as {
          data: LiveSession;
        };
        if (data.status !== currentSession.status) {
          setSessionInStore(data);
        }
      } catch {
        // ignore transient failures
      }
    }, 3000);

    return (): void => clearInterval(interval);
  }, [currentSession?.id, currentSession?.status, setSessionInStore]);

  // When session enters "starting" state, or when mounting onto an already-"live" session
  // (e.g. after a page refresh), poll for the ingest slot then begin WHIP streaming.
  const whipStartedRef = useRef(false);
  useEffect(() => {
    if (!currentSession?.id) return;
    if (currentSession.status !== 'starting' && currentSession.status !== 'live') return;
    if (whipStartedRef.current) return;

    let cancelled = false;

    async function tryStartWhip(): Promise<void> {
      const sessionId = currentSession?.id as LiveSessionId;

      // 1. Poll stream-orchestrator directly until the ingest slot is ready (status = waiting_for_stream).
      let whipUrl: string | null = null;
      while (!cancelled && !whipUrl) {
        try {
          const res = await apiFetch(
            `${API_BASE}/stream-orchestrator/sessions/${sessionId}/ingest`,
          );
          if (res.ok) {
            const data = (await res.json()) as { ingestKey: string; whipUrl: string };
            whipUrl = data.whipUrl;
          }
        } catch {
          // stream-orchestrator not yet ready — keep polling
        }
        if (!whipUrl) await new Promise<void>((r) => setTimeout(r, 1500));
      }
      if (cancelled || !whipUrl) return;

      // 2. Wait for a usable stream: camera preferred, video-share tracks as fallback.
      // This allows the live to start immediately when no webcam is present, as long
      // as a file/URL source is loaded.
      let stream: MediaStream | null = null;
      while (!cancelled && !stream) {
        stream = getStream();
        if (!stream) {
          // No camera — try to build a synthetic stream from video-share tracks
          const vt = videoShare.getVideoTrack();
          if (vt) {
            const synthetic = new MediaStream();
            synthetic.addTrack(vt);
            const at = videoShare.getAudioTrack();
            if (at) synthetic.addTrack(at);
            stream = synthetic;
          }
        }
        if (!stream) await new Promise<void>((r) => setTimeout(r, 200));
      }
      if (cancelled || !stream) return;

      // Mark started before connecting so concurrent effect runs don't double-connect.
      // Reset to false on failure so the next effect cycle retries automatically.
      whipStartedRef.current = true;
      try {
        const bitrate = getVideoQualityPreset(useStreamStore.getState().videoQualityId).bitrate;
        await connectWhip(whipUrl, stream, bitrate);
        // If a video share source was already selected before the WHIP connected, switch both tracks.
        const shareVideoTrack = videoShare.getVideoTrack();
        if (shareVideoTrack) await replaceVideoTrack(shareVideoTrack);
        const shareAudioTrack = videoShare.getAudioTrack();
        if (shareAudioTrack) await replaceAudioTrack(shareAudioTrack);
      } catch {
        whipStartedRef.current = false;
      }
    }

    void tryStartWhip();
    return (): void => {
      cancelled = true;
    };
  }, [currentSession?.id, currentSession?.status, whipRetryTrigger]);

  // Reset WHIP tracking when session ends so it can restart on re-use.
  useEffect(() => {
    if (currentSession?.status === 'ended' || currentSession?.status === 'error') {
      whipStartedRef.current = false;
      appliedSourceRef.current = null;
      disconnectWhip();
    }
  }, [currentSession?.status, disconnectWhip]);

  // Auto-reconnect WHIP when the connection drops mid-stream.
  // Resets whipStartedRef so the start effect can retry, then increments a trigger counter
  // to force the start effect to re-run (its session deps haven't changed).
  useEffect(() => {
    if (whipState !== 'failed') return;
    if (!currentSession?.id) return;
    if (currentSession.status !== 'live' && currentSession.status !== 'starting') return;
    whipStartedRef.current = false;
    const timer = setTimeout(() => setWhipRetryTrigger((n) => n + 1), 3000);
    return (): void => clearTimeout(timer);
  }, [whipState, currentSession?.id, currentSession?.status]);

  // Restore platformVideoContext from localStorage after a page reload.
  // Must run before the preSource effect so the quality picker and CDN re-resolve work.
  useEffect(() => {
    hydratePlatformVideoContext();
  }, []);

  // Apply pre-selected source (set in GoLiveForm dashboard) once the video share hook is ready.
  useEffect(() => {
    if (!preSource) return;
    if (preSource.type === 'local-file' && preSource.file) videoShare.loadLocalFile(preSource.file);
    else if (preSource.type === 'online-url' && preSource.url)
      videoShare.loadOnlineUrl(preSource.url);
    setPreSource(null);
  }, []);

  // Seed the playlist from GoLiveForm when the user pre-configured one before going live.
  useEffect(() => {
    if (prePlaylist.length === 0) return;
    for (const item of prePlaylist) {
      playlist.addItem({
        type: item.type,
        name: item.name,
        ...(item.file !== undefined ? { file: item.file } : {}),
        ...(item.url !== undefined ? { url: item.url } : {}),
      });
    }
    // Play the first item immediately
    playlist.playAt(0);
    setPrePlaylist([]);
    setSettingsOpen(true);
  }, []);

  // Mid-stream video source switching: replace the WHIP video track when the source changes.
  // appliedSourceRef tracks which source type was last successfully applied to the WHIP sender.
  // It is only updated when WHIP is connected, so if the source changes while WHIP is still
  // connecting, the replacement runs as soon as whipState becomes 'connected'.
  const appliedSourceRef = useRef<typeof videoShare.sourceType | null>(null);
  const { sourceType: shareSourceType, getVideoTrack, getAudioTrack } = videoShare;
  useEffect(() => {
    if (whipState !== 'connected') return;
    if (appliedSourceRef.current === shareSourceType) return;

    void (async (): Promise<void> => {
      if (shareSourceType === 'camera') {
        // Tear down compositor (no raw-track restore — camera track is different)
        cancelAnimationFrame(compositorRafRef.current);
        compositorStreamRef.current?.getTracks().forEach((tk) => tk.stop());
        compositorStreamRef.current = null;
        const cameraVideoTrack = getStream()?.getVideoTracks()[0];
        if (cameraVideoTrack) await replaceVideoTrack(cameraVideoTrack);
        const micAudioTrack = getStream()?.getAudioTracks()[0];
        if (micAudioTrack) await replaceAudioTrack(micAudioTrack);
      } else {
        // Audio always comes from the video file
        const audioTrack = getAudioTrack();
        if (audioTrack) await replaceAudioTrack(audioTrack);
        // Video: use compositor when PiP is visible, raw track otherwise
        // (startCompositor may not be defined yet at this call site —
        //  it is defined later; the webcamPipVisible effect handles the
        //  actual compositor start once the source is switched.)
        const videoTrack = getVideoTrack();
        if (videoTrack) await replaceVideoTrack(videoTrack);
      }
      appliedSourceRef.current = shareSourceType;
    })();
  }, [
    shareSourceType,
    whipState,
    getStream,
    replaceVideoTrack,
    replaceAudioTrack,
    getVideoTrack,
    getAudioTrack,
  ]);

  // Auto-play pre-selected video when stream starts.
  // Only triggers when WHIP connects or the video becomes loaded — NOT on every pause,
  // so the user's pause action is not immediately overridden.
  useEffect(() => {
    if (whipState !== 'connected') return;
    if (videoShare.sourceType === 'camera') return;
    if (!videoShare.isVideoLoaded) return;
    if (videoShare.isPlaying) return;
    videoShare.play();
    // intentionally exclude videoShare.isPlaying from deps so this doesn't re-fire on pause
  }, [whipState, videoShare.sourceType, videoShare.isVideoLoaded, videoShare.play]);

  // Refresh the WHIP video+audio tracks whenever a new file finishes loading.
  // Video: use compositor when PiP is visible, raw track otherwise.
  // Audio: always replace here because capturedStream has real audio tracks only
  // after loadeddata — the source-switching effect runs before the video loads and
  // gets null from getAudioTrack(), leaving the camera mic in the WHIP sender.
  useEffect(() => {
    if (whipState !== 'connected') return;
    if (videoShare.sourceType === 'camera') return;
    // startCompositor / webcamPipVisible come from a later declaration;
    // we reference them via refs to avoid stale-closure issues.
    const compositorTrack = webcamPipVisibleRef.current && !isCameraOffRef.current
      ? startCompositorRef.current?.()
      : null;
    if (compositorTrack) {
      void replaceVideoTrack(compositorTrack);
    } else {
      const videoTrack = videoShare.getVideoTrack();
      if (videoTrack) void replaceVideoTrack(videoTrack);
    }
    const audioTrack = videoShare.getAudioTrack();
    if (audioTrack) void replaceAudioTrack(audioTrack);
  }, [videoShare.videoLoadKey]);

  // Persist viewer video control setting on toggle
  const updateAllowViewerVideoControl = useCallback(
    async (allow: boolean): Promise<void> => {
      videoShare.setAllowViewerControl(allow);
      if (!currentSession?.id) return;
      try {
        await apiFetch(`${API_BASE}/sessions/${currentSession.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allowViewerVideoControl: allow }),
        });
      } catch {
        // silent — local state is already updated
      }
    },
    [currentSession?.id, videoShare],
  );

  // ── Stream output quality (bitrate + canvas resolution) — no WHIP restart ──
  // Updates the RTCRtpSender bitrate via setParameters() and rebuilds the compositor
  // canvas at the new dimensions. Both operations work on the live sender; no
  // SDP renegotiation (and therefore no stream reconnect) is required.
  const handleStreamQualityChange = useCallback(
    async (preset: VideoQualityPreset): Promise<void> => {
      setVideoQualityId(preset.id);
      compositorResRef.current = { width: preset.width, height: preset.height };
      await setVideoBitrate(preset.bitrate);
      if (whipState !== 'connected') return;
      if (shareSourceType !== 'camera') {
        // Compositor or raw video track — rebuild at new resolution then replace.
        if (webcamPipVisibleRef.current && !isCameraOffRef.current) {
          const track = startCompositorRef.current?.();
          if (track) await replaceVideoTrack(track);
        } else {
          const rawTrack = videoShare.getVideoTrack();
          if (rawTrack) await replaceVideoTrack(rawTrack);
        }
      } else {
        // Camera-only: apply resolution constraints on the existing track (no restart).
        const cameraTrack = getStream()?.getVideoTracks()[0];
        if (cameraTrack) {
          await cameraTrack
            .applyConstraints({ width: preset.width, height: preset.height })
            .catch(() => {/* device may not support the exact size — ignore */});
          await replaceVideoTrack(cameraTrack);
        }
      }
    },
    [
      setVideoQualityId,
      setVideoBitrate,
      whipState,
      shareSourceType,
      replaceVideoTrack,
      videoShare,
      getStream,
    ],
  );

  // ── Platform source quality switching ──────────────────────
  const [isResolvingQuality, setIsResolvingQuality] = useState(false);

  const handleSourceQualitySwitch = useCallback(
    async (height: number): Promise<void> => {
      if (!platformVideoContext || isResolvingQuality) return;
      setIsResolvingQuality(true);
      try {
        const result = await resolveVideoProxyUrl(platformVideoContext.platformUrl, height);
        const effectiveUrl = result.audioUrl
          ? buildMergeStreamUrl(result.resolvedUrl, result.audioUrl)
          : result.resolvedUrl;
        setPlatformVideoContext({
          platformUrl: platformVideoContext.platformUrl,
          availableHeights:
            result.availableHeights.length > 0
              ? result.availableHeights
              : platformVideoContext.availableHeights,
          selectedHeight: height,
        });
        videoShare.switchOnlineUrl(effectiveUrl);
      } catch {
        // keep current source — VideoSharePlayer will show loadError if needed
      } finally {
        setIsResolvingQuality(false);
      }
    },
    [platformVideoContext, isResolvingQuality, setPlatformVideoContext, videoShare],
  );

  // Auto-re-resolve when the CDN URL expires mid-session (YouTube URLs are time-limited).
  const cdnRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!videoShare.loadError || !platformVideoContext) return;
    if (cdnRetryTimerRef.current) clearTimeout(cdnRetryTimerRef.current);
    cdnRetryTimerRef.current = setTimeout(async () => {
      try {
        const result = await resolveVideoProxyUrl(
          platformVideoContext.platformUrl,
          platformVideoContext.selectedHeight || undefined,
        );
        const effectiveUrl = result.audioUrl
          ? buildMergeStreamUrl(result.resolvedUrl, result.audioUrl)
          : result.resolvedUrl;
        setPlatformVideoContext({
          platformUrl: platformVideoContext.platformUrl,
          availableHeights:
            result.availableHeights.length > 0
              ? result.availableHeights
              : platformVideoContext.availableHeights,
          selectedHeight: platformVideoContext.selectedHeight,
        });
        videoShare.switchOnlineUrl(effectiveUrl);
      } catch {
        // silent — VideoSharePlayer already shows the loadError to the streamer
      }
    }, 3000);
    return (): void => {
      if (cdnRetryTimerRef.current) clearTimeout(cdnRetryTimerRef.current);
    };
  }, [videoShare.loadError]);

  const setMinimizedInStore = useStreamStore((s) => s.setMinimized);

  // When the user returns to the live page, always show the full view
  useEffect(() => {
    setMinimizedInStore(false);
  }, [setMinimizedInStore]);

  const [shareCopied, setShareCopied] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // ── Compositor output resolution — kept in sync with the stream quality preset ──
  // Initialized from the persisted quality preset so it survives page refreshes.
  const compositorResRef = useRef({
    width: getVideoQualityPreset(videoQualityId).width,
    height: getVideoQualityPreset(videoQualityId).height,
  });

  // ── Monitor container — the 16:9 stream panel. PiP drag coordinates and the
  // compositor's screen→canvas scaling are relative to this element.
  const monitorRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);

  // ── Webcam PiP overlay ──────────────────────────────────────
  // Shows the streamer's webcam in a small rounded inset (draggable)
  // when the main feed is a video file/URL (not camera mode).
  const [webcamPipVisible, setWebcamPipVisible] = useState(true);
  const pipVideoRef = useRef<HTMLVideoElement>(null);

  // PiP position — in monitor-container coordinates; placed bottom-right once mounted
  const [pipPos, setPipPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
  // Stable ref so compositor closure always reads the latest position
  const pipPosRef = useRef(pipPos);
  useEffect(() => { pipPosRef.current = pipPos; }, [pipPos]);

  // Default the PiP to the monitor's bottom-right corner after first layout.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const monitor = monitorRef.current;
      if (!monitor) return;
      const pw = pipWrapperRef.current?.offsetWidth ?? 112;
      const ph = pipWrapperRef.current?.offsetHeight ?? 160;
      setPipPos({
        x: Math.max(8, monitor.clientWidth - pw - 16),
        y: Math.max(8, monitor.clientHeight - ph - 16),
      });
    });
    return (): void => cancelAnimationFrame(raf);
  }, []);

  // Drag state
  const dragOffsetRef = useRef<{ ox: number; oy: number } | null>(null);
  const pipWrapperRef = useRef<HTMLDivElement>(null);

  function handlePipPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    const rect = monitorRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOffsetRef.current = {
      ox: e.clientX - rect.left - pipPos.x,
      oy: e.clientY - rect.top - pipPos.y,
    };
  }

  function handlePipPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragOffsetRef.current) return;
    const rect = monitorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wrapper = pipWrapperRef.current;
    const pw = wrapper?.offsetWidth ?? 110;
    const ph = wrapper?.offsetHeight ?? 160;
    const newX = Math.max(
      0,
      Math.min(rect.width - pw, e.clientX - rect.left - dragOffsetRef.current.ox),
    );
    const newY = Math.max(
      0,
      Math.min(rect.height - ph, e.clientY - rect.top - dragOffsetRef.current.oy),
    );
    setPipPos({ x: newX, y: newY });
  }

  function handlePipPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragOffsetRef.current = null;
  }

  // Keep the PiP video element fed with the latest camera MediaStream.
  useEffect(() => {
    const el = pipVideoRef.current;
    if (!el) return;
    const stream = getStream();
    if (stream) {
      el.srcObject = stream;
    } else {
      // Poll until the stream is available (getUserMedia is async)
      const id = setInterval(() => {
        const s = getStream();
        if (s && pipVideoRef.current) {
          pipVideoRef.current.srcObject = s;
          clearInterval(id);
        }
      }, 200);
      return (): void => clearInterval(id);
    }
  }, []);

  // ── Canvas compositor — streams webcam PiP to viewers ──────────
  // When the streamer shares a video file/URL with PiP visible, we
  // composite the video element + webcam onto a hidden canvas and feed
  // that canvas stream as the WHIP video track.  Viewers receive the
  // composite automatically through the existing WHEP pipeline.
  const compositorRafRef = useRef<number>(0);
  const compositorStreamRef = useRef<MediaStream | null>(null);

  /**
   * Builds an offscreen canvas that draws the video-share element
   * (full frame) and the camera element (PiP inset, mirrored) at 30 fps.
   * Returns the first video track of the resulting captureStream, or null
   * if the required video elements are not yet ready.
   */
  const startCompositor = useCallback((): MediaStreamTrack | null => {
    // Canvas compositor requires CORS (drawImage on a non-CORS cross-origin video taints
    // the canvas and captureStream() throws SecurityError). Skip the canvas and return
    // the raw video track instead — viewers get the video without the webcam PiP inset.
    if (!videoShare.isCorsAvailable) {
      cancelAnimationFrame(compositorRafRef.current);
      compositorStreamRef.current?.getTracks().forEach((tk) => tk.stop());
      compositorStreamRef.current = null;
      return videoShare.getVideoTrack();
    }

    // Clean up any previous compositor first
    cancelAnimationFrame(compositorRafRef.current);
    compositorStreamRef.current?.getTracks().forEach((tk) => tk.stop());
    compositorStreamRef.current = null;

    const mainEl = videoShare.videoRef.current;
    const camEl = videoRef.current; // the monitor camera video element
    if (!mainEl) return null;

    const { width: W, height: H } = compositorResRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // PiP geometry — size in canvas pixels
    const PIP_W = 160;
    const PIP_H = 90;
    const PIP_RADIUS = 12;
    // Bottom margin raised to 90px so the viewer's bottom controls/gradient
    // don't cover the PiP (viewer gradient is ~h-52 ≈ 208px, controls sit above it).
    const DEFAULT_BOTTOM_MARGIN = 90;

    function drawFrame(): void {
      compositorRafRef.current = requestAnimationFrame(drawFrame);
      if (!ctx) return;

      // 1. Main video (full frame)
      if (mainEl && mainEl.readyState >= 2) {
        ctx.drawImage(mainEl, 0, 0, W, H);
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
      }

      // 2. Webcam PiP inset — position follows the streamer's drag position,
      //    scaled from monitor-container coordinates to canvas coordinates.
      if (camEl && camEl.readyState >= 2) {
        const monitorEl = monitorRef.current;
        const sw = monitorEl?.clientWidth || W;
        const sh = monitorEl?.clientHeight || H;
        const { x: screenX, y: screenY } = pipPosRef.current;
        // Scale monitor position → canvas position, clamped inside canvas
        const scaleX = W / sw;
        const scaleY = H / sh;
        const pipX = Math.max(0, Math.min(W - PIP_W, screenX * scaleX));
        // If the streamer hasn't moved the pip yet (default position), use the
        // bottom-right corner with a viewer-safe margin.
        const rawPipY = screenY * scaleY;
        const pipY = rawPipY + PIP_H > H - DEFAULT_BOTTOM_MARGIN
          ? H - PIP_H - DEFAULT_BOTTOM_MARGIN
          : Math.max(0, rawPipY);

        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(pipX, pipY, PIP_W, PIP_H, PIP_RADIUS);
        } else {
          ctx.rect(pipX, pipY, PIP_W, PIP_H);
        }
        ctx.clip();
        ctx.translate(pipX + PIP_W, pipY);
        ctx.scale(-1, 1);
        ctx.drawImage(camEl, 0, 0, PIP_W, PIP_H);
        ctx.restore();

        // Subtle border
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(pipX, pipY, PIP_W, PIP_H, PIP_RADIUS);
        } else {
          ctx.rect(pipX, pipY, PIP_W, PIP_H);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    drawFrame();

    const stream = canvas.captureStream(30);
    compositorStreamRef.current = stream;
    return stream.getVideoTracks()[0] ?? null;
  }, [videoShare.videoRef, videoRef, pipPosRef]);

  /** Tears down the compositor and optionally restores the raw video track. */
  const stopCompositor = useCallback(
    async (restoreRawTrack = true): Promise<void> => {
      cancelAnimationFrame(compositorRafRef.current);
      compositorStreamRef.current?.getTracks().forEach((tk) => tk.stop());
      compositorStreamRef.current = null;
      if (restoreRawTrack && whipState === 'connected') {
        const rawTrack = videoShare.getVideoTrack();
        if (rawTrack) await replaceVideoTrack(rawTrack);
      }
    },
    [whipState, videoShare, replaceVideoTrack],
  );

  // Stable mutable refs so the videoLoadKey effect (declared earlier, runs
  // asynchronously) can always read the latest values without stale closures.
  const webcamPipVisibleRef = useRef(webcamPipVisible);
  const isCameraOffRef = useRef(isCameraOff);
  const startCompositorRef = useRef(startCompositor);
  useEffect(() => { webcamPipVisibleRef.current = webcamPipVisible; }, [webcamPipVisible]);
  useEffect(() => { isCameraOffRef.current = isCameraOff; }, [isCameraOff]);
  useEffect(() => { startCompositorRef.current = startCompositor; }, [startCompositor]);

  // Start / stop the canvas compositor whenever:
  //   • the streamer toggles the webcam PiP on/off
  //   • the source type changes (camera ↔ video file)
  //   • the camera is turned off while PiP is visible
  useEffect(() => {
    if (whipState !== 'connected') return;
    if (shareSourceType === 'camera') {
      // No compositor needed in full-camera mode; clean up if it was running.
      void stopCompositor(false);
      return;
    }
    if (webcamPipVisible && !isCameraOff) {
      // Start compositor and push the composited track to WHIP.
      const track = startCompositor();
      if (track) void replaceVideoTrack(track);
    } else {
      // PiP hidden or cam turned off — restore the raw video-file track.
      void stopCompositor(true);
    }
    return (): void => {
      // Cleanup on unmount / deps change — stop the RAF loop only;
      // track replacement is handled by the next effect run.
      cancelAnimationFrame(compositorRafRef.current);
    };
  }, [
    webcamPipVisible,
    isCameraOff,
    shareSourceType,
    whipState,
    startCompositor,
    stopCompositor,
    replaceVideoTrack,
  ]);

  const [viewersVisible, setViewersVisible] = useState(false);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  const [socketViewerCount, setSocketViewerCount] = useState(0);

  // Track live viewer count from socket
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const handler = (data: { viewers: { id: string; displayName: string }[] }): void => {
      setSocketViewerCount(data.viewers.length);
    };
    socket.on('viewers_update', handler);
    return (): void => { socket.off('viewers_update', handler); };
  // Re-attach when session changes (socket reconnects); socketRef is a stable ref
  }, [currentSession?.id]);

  // Switch the rail to the viewers tab when the streamer enables viewer video
  // control, so they can immediately select which viewers to grant access.
  const prevAllowViewerControlRef = useRef(false);
  useEffect(() => {
    if (videoShare.allowViewerControl && !prevAllowViewerControlRef.current) {
      setRailTab('viewers');
    }
    prevAllowViewerControlRef.current = videoShare.allowViewerControl;
  }, [videoShare.allowViewerControl]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/watch/${currentSession?.id ?? ''}`;
    if (!currentSession?.id) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: t('share.title'), url });
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      // native share failed (e.g. non-HTTPS) — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      // clipboard denied — no-op
    }
  }, [currentSession?.id, t]);

  const fireReaction = useCallback(() => {
    const emoji = REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)] ?? '❤️';
    addReaction({ id: crypto.randomUUID(), emoji, left: Math.floor(Math.random() * 36) });
  }, [addReaction]);

  const updateViewersVisibility = useCallback(
    async (visible: boolean): Promise<void> => {
      if (!currentSession?.id) return;
      setIsTogglingVisibility(true);
      try {
        await apiFetch(`${API_BASE}/sessions/${currentSession.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewersVisible: visible }),
        });
      } catch {
        // silent fail — update local state regardless
      } finally {
        setViewersVisible(visible);
        setIsTogglingVisibility(false);
      }
    },
    [currentSession?.id],
  );

  function handleMinimize(): void {
    setIsMinimized(true);
    setMinimizedInStore(true);
    router.push('/dashboard');
  }

  // Mini-player home button while still on live page
  function handleMiniPlayerGoHome(): void {
    router.push('/dashboard');
  }

  function handleViewersClick(): void {
    setRailTab('viewers');
    railRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function handleConfirmEnd(): void {
    if (!currentSession) return;
    void endSession(currentSession.id).finally(() => setEndDialogOpen(false));
  }

  const qualityPreset = getVideoQualityPreset(videoQualityId);
  const whipHealthDot =
    whipState === 'connected'
      ? 'bg-emerald-400'
      : whipState === 'failed'
        ? 'bg-red-500'
        : 'bg-amber-400';
  const whipHealthLabel =
    whipState === 'connected'
      ? t('controlRoom.healthStreaming')
      : whipState === 'failed'
        ? t('controlRoom.healthError')
        : t('controlRoom.healthConnecting');



  return (
    <>
      {isMinimized && (
        <MinimizedPlayer
          stream={getStream()}
          elapsed={elapsed}
          isPaused={isPaused}
          isPausing={isPausing}
          onPause={() => currentSession && void pauseSession(currentSession.id)}
          onResume={() => currentSession && void resumeSession(currentSession.id)}
          onRestore={() => {
            setIsMinimized(false);
            setMinimizedInStore(false);
          }}
          onGoHome={handleMiniPlayerGoHome}
        />
      )}

      <div
        className={cn(
          'flex min-h-svh flex-col bg-surface-0 text-foreground lg:h-svh',
          isMinimized && 'hidden',
        )}
      >
        <LiveStatusBar
          isLive={isLive}
          isStarting={isStarting}
          isPaused={isPaused}
          elapsed={elapsed}
          destinations={destinations}
          viewerCount={socketViewerCount}
          isEnding={isEnding}
          isPausing={isPausing}
          shareCopied={shareCopied}
          onGoHome={handleMinimize}
          onPauseResume={() =>
            currentSession &&
            void (isPaused ? resumeSession(currentSession.id) : pauseSession(currentSession.id))
          }
          onShare={() => void handleShare()}
          onViewersClick={handleViewersClick}
          onEndClick={() => setEndDialogOpen(true)}
          title={currentSession?.title}
          description={currentSession?.description ?? undefined}
          isMicMuted={isMicMuted}
          isCameraOff={isCameraOff}
          isVideoSharing={videoShare.sourceType !== 'camera'}
        />

        <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
          {/* ── Main column: monitor, stats, controls, settings ── */}
          <main className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:p-6">
            {/* ── Stream monitor — full-bleed on mobile, gradient-bordered 16:9 panel on desktop ── */}
            <div className="shrink-0 bg-gradient-brand lg:rounded-card lg:p-px lg:shadow-brand-glow">
              <section
                ref={monitorRef}
                className="relative aspect-video w-full overflow-hidden bg-black lg:rounded-[calc(var(--radius-card)-1px)]"
              >
                {/* Camera feed — always mounted for mic track; hidden when video share is active */}
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className={cn(
                    'absolute inset-0 h-full w-full object-cover',
                    (isCameraOff || videoShare.sourceType !== 'camera') && 'opacity-0',
                  )}
                />

                {/* Video share element — always in DOM so captureStream() works; shown when active */}
                {/* Not muted: local monitoring volume is controlled by video.volume (setVideoVolume).
                    captureStream() carries the audio track for WebRTC. */}
                <video
                  ref={videoShare.videoRef}
                  autoPlay
                  playsInline
                  preload="auto"
                  onClick={() => {
                    if (videoShare.sourceType !== 'camera') {
                      if (videoShare.isPlaying) videoShare.pause();
                      else videoShare.play();
                    }
                  }}
                  className={cn(
                    'absolute inset-0 h-full w-full bg-black object-contain',
                    videoShare.sourceType === 'camera'
                      ? 'pointer-events-none opacity-0'
                      : 'cursor-pointer',
                  )}
                />

                {/* Camera-off placeholder */}
                {isCameraOff && videoShare.sourceType === 'camera' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <svg className="h-10 w-10 text-white/25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10M1 1l22 22" />
                    </svg>
                  </div>
                )}

                {/* Play-button overlay: visible when video is loaded but paused */}
                {videoShare.sourceType !== 'camera' &&
                  videoShare.isVideoLoaded &&
                  !videoShare.isPlaying && (
                    <button
                      type="button"
                      aria-label="Lire la vidéo"
                      onClick={() => videoShare.play()}
                      className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/60 text-white backdrop-blur-sm transition-opacity hover:bg-black/80"
                    >
                      <svg className="h-7 w-7 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </button>
                  )}

                {/* ── WHIP reconnecting overlay — shown when connection drops mid-live ── */}
                {whipState === 'connecting' && isLive && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                    <div className="flex items-center gap-2.5 rounded-full border border-white/20 bg-black/65 px-4 py-2.5 backdrop-blur-xl">
                      <svg className="h-4 w-4 animate-spin text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                      </svg>
                      <span className="text-xs font-medium text-white/70">{t('connecting')}</span>
                    </div>
                  </div>
                )}

                {/* ── Video share buffering overlay ── */}
                {videoShare.isBuffering && videoShare.sourceType !== 'camera' && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                    <div className="flex items-center gap-2.5 rounded-full border border-white/20 bg-black/65 px-4 py-2.5 backdrop-blur-xl">
                      <svg className="h-4 w-4 animate-spin text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                      </svg>
                      <span className="text-xs font-medium text-white/60">{t('videoShare.buffering')}</span>
                    </div>
                  </div>
                )}

                {/* ── Webcam PiP overlay (draggable, monitor-relative) ── */}
                {/* Always in the DOM so pipVideoRef is populated at mount. */}
                <div
                  ref={pipWrapperRef}
                  onPointerDown={handlePipPointerDown}
                  onPointerMove={handlePipPointerMove}
                  onPointerUp={handlePipPointerUp}
                  style={{ left: pipPos.x, top: pipPos.y }}
                  className={cn(
                    'absolute z-30 cursor-grab select-none transition-opacity duration-300 ease-out active:cursor-grabbing',
                    videoShare.sourceType !== 'camera' && !isCameraOff && webcamPipVisible
                      ? 'pointer-events-auto scale-100 opacity-100'
                      : 'pointer-events-none scale-90 opacity-0',
                  )}
                >
                  {/* Outer glow ring */}
                  <div className="rounded-2xl bg-gradient-to-br from-white/30 via-white/10 to-white/5 p-[2px] shadow-2xl shadow-black/60">
                    <div className="relative overflow-hidden rounded-[14px] border border-white/10">
                      <video
                        ref={pipVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="block h-32 w-[90px] object-cover [transform:scaleX(-1)] sm:h-40 sm:w-28"
                      />
                      {/* Subtle vignette */}
                      <div className="pointer-events-none absolute inset-0 rounded-[14px] bg-gradient-to-b from-black/10 via-transparent to-black/20" />
                      {/* Live indicator dot */}
                      <div className="absolute left-2 top-2 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)]" />
                      </div>
                      {/* Drag hint — shows on hover */}
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100">
                        <svg className="h-5 w-5 text-white/60 drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" />
                          <polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" />
                          <line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Monitor overlay chips: LIVE + timer (left), health/bitrate (right) ── */}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between bg-gradient-to-b from-black/40 to-transparent p-3 pb-10">
                  <div className="flex items-center gap-2">
                    {isStarting && (
                      <span className="flex items-center gap-1.5 rounded-full border border-orange-300/30 bg-orange-600/90 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-sm backdrop-blur-xl">
                        <span className="h-1.5 w-1.5 animate-spin rounded-full border border-white border-t-transparent" />
                        {t('status.starting')}
                      </span>
                    )}
                    {isLive && (
                      <span className="badge-live px-3 py-1 text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        {t('status.live')}
                      </span>
                    )}
                    {isPaused && (
                      <span className="flex items-center gap-1.5 rounded-full border border-yellow-300/30 bg-yellow-600/90 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-sm backdrop-blur-xl">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        {t('status.paused')}
                      </span>
                    )}
                    <span className={cn(GLASS_PILL, 'rounded-full px-2.5 py-1 font-mono text-xs font-semibold tabular-nums')}>
                      {elapsed}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isRecording && (
                      <span className="flex items-center gap-1.5 rounded-full border border-red-300/30 bg-red-600/90 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white backdrop-blur-xl">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                        {t('recording.active')}
                      </span>
                    )}
                    <span
                      className={cn(GLASS_PILL, 'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold')}
                      title={whipHealthLabel}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', whipHealthDot)} />
                      {qualityPreset.label} · {(qualityPreset.bitrate / 1_000_000).toLocaleString()} Mbps
                    </span>
                  </div>
                </div>

                {/* ── Floating emoji reactions ── */}
                <div className="pointer-events-none absolute bottom-3 right-3 z-20 h-32 w-12 overflow-visible sm:h-44">
                  {liveReactions.map((r) => (
                    <LiveReactionFloat
                      key={r.id}
                      id={r.id}
                      emoji={r.emoji}
                      left={r.left}
                      onDone={removeReaction}
                    />
                  ))}
                </div>
              </section>
            </div>

            {/* ── Stats strip ── */}
            <LiveStatsStrip
              viewerCount={socketViewerCount}
              commentCount={commentCount}
              reactionCount={reactionCount}
              className="shrink-0 px-4 lg:px-0"
            />

            {/* ── Media controls row (translucent glass bar matching Stitch design) ── */}
            <div className="mx-4 shrink-0 lg:mx-0">
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-surface-1/80 px-4 py-3 backdrop-blur-md">
                {/* Left controls */}
                <div className="flex items-center gap-3">
                  {/* Microphone toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      if (cameraState === 'active') {
                        toggleMic();
                      } else {
                        void startCamera();
                      }
                    }}
                    title={isMicMuted ? t('camera.unmute') : t('camera.mute')}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-foreground transition-all',
                      cameraState === 'active' && !isMicMuted
                        ? 'bg-brand text-white border-transparent shadow-[0_0_8px_rgba(255,45,85,0.4)]'
                        : 'bg-surface-2 hover:bg-muted text-muted-foreground',
                    )}
                  >
                    {isMicMuted || cameraState !== 'active' ? (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="1" y1="1" x2="23" y2="23" />
                        <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
                        <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 20v4M8 20h8" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                        <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
                      </svg>
                    )}
                  </button>

                  {/* Camera/Webcam toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      if (cameraState !== 'active') {
                        void startCamera();
                      } else {
                        if (videoShare.sourceType === 'camera') {
                          toggleCamera();
                        } else {
                          setWebcamPipVisible((v) => !v);
                        }
                      }
                    }}
                    title={
                      cameraState !== 'active'
                        ? t('camera.enableWebcam')
                        : videoShare.sourceType === 'camera'
                          ? isCameraOff
                            ? t('camera.showCamera')
                            : t('camera.hideCamera')
                          : webcamPipVisible
                            ? 'Hide webcam overlay'
                            : 'Show webcam overlay'
                    }
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-foreground transition-all',
                      cameraState === 'active' &&
                        (videoShare.sourceType === 'camera' ? !isCameraOff : webcamPipVisible)
                        ? 'bg-brand text-white border-transparent shadow-[0_0_8px_rgba(255,45,85,0.4)]'
                        : 'bg-surface-2 hover:bg-muted text-muted-foreground',
                    )}
                  >
                    {cameraState === 'active' &&
                    (videoShare.sourceType === 'camera' ? isCameraOff : !webcamPipVisible) ? (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10M1 1l22 22" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                      </svg>
                    )}
                  </button>

                  {/* Upload/Share screen button */}
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(!settingsOpen);
                      // Scroll settings into view on open
                      if (!settingsOpen) {
                        setTimeout(() => {
                          const el = document.getElementById('stream-source-picker');
                          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                      }
                    }}
                    title="Upload / Share video source"
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-foreground transition-all hover:bg-muted',
                      settingsOpen
                        ? 'bg-surface-3 border-white/20 text-white'
                        : 'bg-surface-2 text-muted-foreground',
                    )}
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </button>

                  {/* Collaborator/Add-User button */}
                  <button
                    type="button"
                    onClick={handleViewersClick}
                    title="Viewers & Collaborators"
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-foreground transition-all hover:bg-muted',
                      railTab === 'viewers'
                        ? 'bg-surface-3 border-white/20 text-white'
                        : 'bg-surface-2 text-muted-foreground',
                    )}
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </button>
                </div>

                {/* Right controls: Advanced Settings toggle */}
                <button
                  type="button"
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>Advanced Settings</span>
                  <svg
                    className={cn('h-4 w-4 transition-transform duration-200', settingsOpen && 'rotate-180')}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── Collapsible stream settings: resolution, source, links ── */}
            <StreamSettingsRow
              open={settingsOpen}
              onToggle={() => setSettingsOpen((o) => !o)}
              className="mx-4 shrink-0 lg:mx-0"
            >
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Video source — dark island: the share player/picker are styled for dark surfaces */}
                <div id="stream-source-picker" className="dark flex flex-col gap-3 rounded-xl border border-[var(--card-border-color)] bg-surface-1 p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('videoShare.sourceLabel')}
                  </span>
                  <VideoSourcePicker
                    sourceType={videoShare.sourceType}
                    recentSources={videoShare.recentSources}
                    cameraDisabled={!hasWebcam && cameraState !== 'active'}
                    currentFileName={
                      videoShare.sourceType === 'local-file'
                        ? videoShare.recentSources.find((s) => s.type === 'local-file')?.name
                        : undefined
                    }
                    currentUrl={
                      videoShare.sourceType === 'online-url'
                        ? (platformVideoContext?.platformUrl ?? videoShare.effectiveUrl ?? undefined)
                        : undefined
                    }
                    onSelectCamera={() => {
                      videoShare.switchToCamera();
                      setPlatformVideoContext(null);
                    }}
                    onSelectLocalFile={(file) => {
                      videoShare.loadLocalFile(file);
                      setPlatformVideoContext(null);
                    }}
                    onSelectMultipleLocalFiles={(files) => {
                      for (const file of files) {
                        playlist.addItem({ type: 'local-file', name: file.name, file });
                      }
                    }}
                    onSelectOnlineUrl={(url) => {
                      videoShare.loadOnlineUrl(url);
                      // Context will be refreshed via onResolved if this came from a resolve;
                      // for direct URLs (no resolve), clear stale context.
                      setPlatformVideoContext(null);
                    }}
                    onSwitchQuality={(url) => videoShare.switchOnlineUrl(url)}
                    onResolved={(ctx) =>
                      setPlatformVideoContext({
                        platformUrl: ctx.platformUrl,
                        availableHeights: ctx.availableHeights,
                        selectedHeight: ctx.selectedHeight,
                      })
                    }
                  />
                  {videoShare.sourceType !== 'camera' && (
                    <VideoSharePlayer
                      isPlaying={videoShare.isPlaying}
                      currentTime={videoShare.currentTime}
                      duration={videoShare.duration}
                      allowViewerControl={videoShare.allowViewerControl}
                      isVideoLoaded={videoShare.isVideoLoaded}
                      isBuffering={videoShare.isBuffering}
                      isQualitySwitching={videoShare.isQualitySwitching}
                      bufferedAhead={videoShare.bufferedAhead}
                      bufferedRanges={videoShare.bufferedRanges}
                      loadError={videoShare.loadError}
                      videoVolume={videoShare.videoVolume}
                      onPlay={() => videoShare.play()}
                      onPause={() => videoShare.pause()}
                      onSeek={(time) => videoShare.seek(time)}
                      onSetSpeed={(r) => videoShare.setSpeed(r)}
                      onToggleViewerControl={(allow) => void updateAllowViewerVideoControl(allow)}
                      onSetVideoVolume={(vol) => videoShare.setVideoVolume(vol)}
                      onPrev={() => playlist.playPrev()}
                      onNext={() => playlist.playNext()}
                      hasPrev={playlist.hasPrev}
                      hasNext={playlist.hasNext}
                    />
                  )}

                  {/* Source quality picker — shown when a platform URL has been resolved */}
                  {videoShare.sourceType === 'online-url' &&
                    platformVideoContext &&
                    platformVideoContext.availableHeights.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t('videoShare.sourceQualityLabel')}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {platformVideoContext.availableHeights.map((h) => {
                            const isActive = platformVideoContext.selectedHeight === h;
                            return (
                              <button
                                key={h}
                                type="button"
                                disabled={isResolvingQuality}
                                onClick={() => void handleSourceQualitySwitch(h)}
                                className={cn(
                                  'rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition-colors disabled:opacity-40',
                                  isActive
                                    ? 'border-brand/60 bg-brand/20 text-brand'
                                    : 'border-[var(--input-border-color)] bg-surface-2 text-muted-foreground hover:bg-muted hover:text-foreground',
                                )}
                              >
                                {isResolvingQuality && isActive ? (
                                  <span className="flex items-center gap-1">
                                    <span className="h-2 w-2 animate-spin rounded-full border border-current border-t-transparent" />
                                    {h}p
                                  </span>
                                ) : (
                                  `${h}p`
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                </div>

                <div className="flex flex-col gap-4">
                  {/* Stream quality selector */}
                  <div className="flex flex-col gap-2 rounded-xl border border-[var(--card-border-color)] bg-surface-1 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('quality.streamLabel')}
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {VIDEO_QUALITY_PRESETS.map((preset) => {
                        const isSelected = videoQualityId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => void handleStreamQualityChange(preset)}
                            className={cn(
                              'flex flex-col items-center rounded-xl border px-1.5 py-2 text-center text-[10px] transition-colors',
                              isSelected
                                ? 'border-brand/60 bg-brand/20 text-brand'
                                : 'border-[var(--input-border-color)] bg-surface-2 text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                          >
                            <span className="font-semibold">{preset.label}</span>
                            <span className="leading-tight opacity-70">{preset.subLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Stream links: watch page, HLS, WebRTC, stream key */}
                  {currentSession && (
                    <StreamLinksCard
                      sessionId={currentSession.id}
                      platformHlsUrl={platformHlsUrl}
                      platformWhepUrl={platformWhepUrl}
                    />
                  )}

                  {/* Audio & Live Actions */}
                  <div className="flex flex-col gap-3 rounded-xl border border-[var(--card-border-color)] bg-surface-1 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('volume.mic')} / {t('controlRoom.reactions')}
                    </span>
                    
                    {/* Volume sliders */}
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <svg className="h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                            <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
                          </svg>
                          {t('volume.mic')}
                        </span>
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={micVolume}
                            onChange={(e) => setMicVolume(Number(e.target.value))}
                            aria-label={t('volume.mic')}
                            className="h-1 w-24 cursor-pointer accent-brand"
                          />
                          <span className="w-8 text-right text-xs font-mono text-muted-foreground">{micVolume}%</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <svg className="h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                          </svg>
                          {t('volume.monitor')}
                        </span>
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={speakerVolume}
                            onChange={(e) => setSpeakerVolume(Number(e.target.value))}
                            aria-label={t('volume.monitor')}
                            className="h-1 w-24 cursor-pointer accent-brand"
                          />
                          <span className="w-8 text-right text-xs font-mono text-muted-foreground">{speakerVolume}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="my-1 h-px bg-white/5" />

                    {/* Stream Actions: Recording & Reactions */}
                    <div className="flex items-center gap-2">
                      {/* Recording toggle — visible only when live */}
                      {isLive && (
                        <button
                          type="button"
                          onClick={() => currentSession && void toggleRecording(currentSession.id)}
                          disabled={isTogglingRecording}
                          className={cn(
                            'flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--input-border-color)] bg-surface-2 py-2 text-xs font-semibold text-foreground transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
                            isRecording && 'border-red-400/50 bg-red-500/10 text-red-500 hover:bg-red-500/20',
                          )}
                        >
                          <span className={cn('h-2 w-2 rounded-full', isRecording ? 'bg-red-500 animate-pulse' : 'border border-current')} />
                          {isRecording ? t('recording.stop') : t('recording.start')}
                        </button>
                      )}

                      {/* Reactions Button */}
                      <button
                        type="button"
                        onClick={fireReaction}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--input-border-color)] bg-surface-2 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        <svg className="h-3.5 w-3.5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                        {t('controlRoom.reactions')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Playlist */}
                <div className="dark rounded-xl border border-[var(--card-border-color)] bg-surface-1 p-3 lg:col-span-2">
                  <PlaylistPanel
                    items={playlist.items}
                    currentIndex={playlist.currentIndex}
                    onPlayAt={(index) => playlist.playAt(index)}
                    onRemove={(id) => playlist.removeItem(id)}
                    onAddFiles={(files) => {
                      for (const file of files) {
                        playlist.addItem({ type: 'local-file', name: file.name, file });
                      }
                    }}
                    onAddUrl={(url) => {
                      playlist.addItem({ type: 'online-url', name: url, url });
                    }}
                    onClear={() => playlist.clearPlaylist()}
                    onClose={() => setSettingsOpen(false)}
                  />
                </div>
              </div>
            </StreamSettingsRow>
          </main>

          {/* ── Right rail: chat / viewers tabs ── */}
          <aside
            ref={railRef}
            className="mt-4 flex min-h-[28rem] flex-col border-t border-[var(--card-border-color)] bg-surface-1 pb-20 lg:mt-0 lg:min-h-0 lg:w-[22.5rem] lg:shrink-0 lg:border-l lg:border-t-0 lg:pb-0 xl:w-96"
          >
            <div className="flex shrink-0 border-b border-[var(--card-border-color)]">
              <button
                type="button"
                onClick={() => setRailTab('chat')}
                aria-selected={railTab === 'chat'}
                className={cn(
                  'relative flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors',
                  railTab === 'chat' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('controlRoom.chatTab')}
                {comments.length > 0 && (
                  <span className="rounded-full border border-[var(--card-border-color)] bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {comments.length}
                  </span>
                )}
                {railTab === 'chat' && (
                  <span className="bg-gradient-brand absolute inset-x-6 bottom-0 h-0.5 rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setRailTab('viewers')}
                aria-selected={railTab === 'viewers'}
                className={cn(
                  'relative flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors',
                  railTab === 'viewers' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('controlRoom.viewersTab')}
                <span className="rounded-full border border-[var(--card-border-color)] bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {socketViewerCount}
                </span>
                {railTab === 'viewers' && (
                  <span className="bg-gradient-brand absolute inset-x-6 bottom-0 h-0.5 rounded-full" />
                )}
              </button>
            </div>

            <div className="min-h-0 flex-1">
              {railTab === 'chat' ? (
                <LiveCommentPanel
                  sendComment={sendComment}
                  replyToComment={replyToComment}
                  emitReaction={emitReaction}
                  isSending={isSending}
                />
              ) : (
                currentSession && (
                  <ViewersPanel
                    sessionId={currentSession.id}
                    apiBase={API_BASE}
                    onClose={() => setRailTab('chat')}
                    embedded
                    showAudienceToggle
                    viewersVisible={viewersVisible}
                    onToggleViewersVisible={(v) => void updateViewersVisibility(v)}
                    isTogglingVisibility={isTogglingVisibility}
                    socketRef={socketRef}
                    allowedViewerIds={videoShare.allowedViewerIds}
                    onGrantViewerControl={videoShare.grantViewerControl}
                    videoControlEnabled={
                      videoShare.allowViewerControl && videoShare.sourceType !== 'camera'
                    }
                  />
                )
              )}
            </div>
          </aside>
        </div>

        <StickyEndStreamBar
          isEnding={isEnding}
          onGoHome={handleMinimize}
          onEndClick={() => setEndDialogOpen(true)}
        />

        <EndStreamDialog
          open={endDialogOpen}
          isEnding={isEnding}
          onCancel={() => setEndDialogOpen(false)}
          onConfirm={handleConfirmEnd}
        />
      </div>
    </>
  );
}
