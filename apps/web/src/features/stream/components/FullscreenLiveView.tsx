'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { API_BASE, apiFetch } from '@/lib/api';
import { useStream } from '../hooks/useStream';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { useCameraStream } from '../hooks/useCameraStream';
import { useWhipStream } from '../hooks/useWhipStream';
import { useStreamStore } from '../store/stream.store';
import { getVideoQualityPreset, VIDEO_QUALITY_PRESETS } from '../consts/stream.consts';
import { useComments } from '@/features/comments/hooks/useComments';
import { useRecording } from '../hooks/useRecording';
import { useVideoShare } from '../hooks/useVideoShare';
import type { LiveSessionId } from '@tik-live-pro/shared-types';
import { LiveCommentFloat } from './LiveCommentFloat';
import { LiveReactionFloat } from './LiveReactionFloat';
import { MinimizedPlayer } from './MinimizedPlayer';
import { LiveCommentPanel } from './LiveCommentPanel';
import { ViewersPanel } from './ViewersPanel';
import { VideoSourcePicker } from './VideoSourcePicker';
import { VideoSharePlayer } from './VideoSharePlayer';

const REACTION_EMOJIS = ['❤️', '🔥', '😍', '👏', '💯', '🎉'];

// Shared glass token for action pill buttons
const GLASS_PILL =
  'bg-black/45 backdrop-blur-xl border border-white/20 text-white transition-colors';

export function FullscreenLiveView(): React.ReactElement {
  const t = useTranslations('stream');
  const router = useRouter();
  const { currentSession, isEnding, isPausing, endSession, pauseSession, resumeSession } =
    useStream();
  const {
    comments,
    liveReactions,
    addReaction,
    removeReaction,
    videoQualityId,
    setVideoQualityId,
    preSource,
    setPreSource,
  } = useStreamStore();
  const isPaused = currentSession?.status === 'paused';
  const {
    videoRef,
    isMicMuted,
    isCameraOff,
    micVolume,
    speakerVolume,
    toggleMic,
    toggleCamera,
    setMicVolume,
    setSpeakerVolume,
    getStream,
  } = useCameraStream(true);

  const { sendComment, replyToComment, emitReaction, isSending, socketRef } = useComments(
    currentSession?.id ?? null,
  );
  const videoShare = useVideoShare({ socketRef, sessionId: currentSession?.id ?? null });
  const {
    state: whipState,
    connect: connectWhip,
    disconnect: disconnectWhip,
    replaceVideoTrack,
    replaceAudioTrack,
    setVideoBitrate,
  } = useWhipStream();
  const {
    isRecording,
    isToggling: isTogglingRecording,
    toggle: toggleRecording,
  } = useRecording((currentSession?.id as LiveSessionId) ?? null);

  const isLive = currentSession?.status === 'live';
  const isStarting = currentSession?.status === 'starting';
  const elapsed = useElapsedTime(isLive ? (currentSession?.startedAt ?? null) : null);
  const destinations = (currentSession?.destinations ?? []).filter(
    (d) => d.platform !== 'platform',
  );
  const liveCount = destinations.filter((d) => d.status === 'live').length;
  const platformHlsUrl = currentSession?.platformHlsUrl ?? null;
  const platformWhepUrl = (() => {
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
          data: import('@tik-live-pro/shared-types').LiveSession;
        };
        if (data.status !== currentSession.status) {
          setSessionInStore(data);
        }
      } catch {
        // ignore transient failures
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [currentSession?.id, currentSession?.status, setSessionInStore]);

  // When session enters "starting" state, poll for the ingest slot, then begin WHIP streaming.
  const whipStartedRef = useRef(false);
  useEffect(() => {
    if (!currentSession?.id || currentSession.status !== 'starting') return;
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

      // 2. Wait for camera stream to be ready (getUserMedia is async).
      let stream: MediaStream | null = null;
      while (!cancelled && !stream) {
        stream = getStream();
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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession?.id, currentSession?.status]);

  // Reset WHIP tracking when session ends so it can restart on re-use.
  useEffect(() => {
    if (currentSession?.status === 'ended' || currentSession?.status === 'error') {
      whipStartedRef.current = false;
      appliedSourceRef.current = null;
      disconnectWhip();
    }
  }, [currentSession?.status, disconnectWhip]);

  // Apply pre-selected source (set in GoLiveForm dashboard) once the video share hook is ready.
  useEffect(() => {
    if (!preSource) return;
    if (preSource.type === 'local-file' && preSource.file) videoShare.loadLocalFile(preSource.file);
    else if (preSource.type === 'online-url' && preSource.url)
      videoShare.loadOnlineUrl(preSource.url);
    setPreSource(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    void (async () => {
      if (shareSourceType === 'camera') {
        const cameraVideoTrack = getStream()?.getVideoTracks()[0];
        if (cameraVideoTrack) await replaceVideoTrack(cameraVideoTrack);
        const micAudioTrack = getStream()?.getAudioTracks()[0];
        if (micAudioTrack) await replaceAudioTrack(micAudioTrack);
      } else {
        const videoTrack = getVideoTrack();
        if (videoTrack) await replaceVideoTrack(videoTrack);
        const audioTrack = getAudioTrack();
        if (audioTrack) await replaceAudioTrack(audioTrack);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whipState, videoShare.sourceType, videoShare.isVideoLoaded, videoShare.play]);

  // Refresh the WHIP video track whenever a new file finishes loading.
  // captureStream() re-captures a live track in onLoadedData; replacing the sender
  // prevents the receiver from showing a frozen/black frame after a source change.
  useEffect(() => {
    if (whipState !== 'connected') return;
    if (videoShare.sourceType === 'camera') return;
    const videoTrack = videoShare.getVideoTrack();
    if (videoTrack) void replaceVideoTrack(videoTrack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const setMinimizedInStore = useStreamStore((s) => s.setMinimized);

  // When the user returns to the live page, always show the full view
  useEffect(() => {
    setMinimizedInStore(false);
  }, [setMinimizedInStore]);

  const mountedAtRef = useRef(Date.now());
  const [shareCopied, setShareCopied] = useState(false);
  const [whepCopied, setWhepCopied] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [viewersPanelOpen, setViewersPanelOpen] = useState(false);
  const [videoSourceOpen, setVideoSourceOpen] = useState(false);
  const [bottomControlsVisible, setBottomControlsVisible] = useState(true);
  const bottomHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showBottomControls(): void {
    setBottomControlsVisible(true);
    if (bottomHideTimerRef.current) clearTimeout(bottomHideTimerRef.current);
    bottomHideTimerRef.current = setTimeout(() => setBottomControlsVisible(false), 4000);
  }

  function handleStreamerMouseMove(): void {
    showBottomControls();
  }

  // Keep bottom controls visible whenever a panel is open
  useEffect(() => {
    if (commentsOpen || viewersPanelOpen || videoSourceOpen) {
      if (bottomHideTimerRef.current) clearTimeout(bottomHideTimerRef.current);
      setBottomControlsVisible(true);
    }
  }, [commentsOpen, viewersPanelOpen, videoSourceOpen]);

  // ── Unread comment tracking ──────────────────────────────────
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCommentLenRef = useRef(0);

  useEffect(() => {
    const curr = comments.length;
    const prev = prevCommentLenRef.current;
    prevCommentLenRef.current = curr;
    if (commentsOpen) {
      setUnreadCount(0);
      return;
    }
    if (curr > prev && comments[0]) {
      setUnreadCount((n) => n + curr - prev);
      toast(comments[0].content?.slice(0, 72) ?? '…', {
        description: comments[0].authorName,
        duration: 3500,
      });
    }
  }, [comments, commentsOpen]);
  const [viewersVisible, setViewersVisible] = useState(false);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);

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

  function handleGoToDashboard(): void {
    handleMinimize();
  }

  // Mini-player home button while still on live page
  function handleMiniPlayerGoHome(): void {
    router.push('/dashboard');
  }

  const overlayComments = comments.slice(0, 5);

  function isNewComment(comment: { receivedAt: Date | string }): boolean {
    const ms =
      comment.receivedAt instanceof Date
        ? comment.receivedAt.getTime()
        : new Date(comment.receivedAt as string).getTime();
    return ms > mountedAtRef.current - 500;
  }

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
        className={cn('fixed inset-0 z-50 overflow-hidden bg-black', isMinimized && 'invisible')}
        onMouseMove={handleStreamerMouseMove}
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
        {/* Not muted: Web Audio (createMediaElementSource) has taken over audio routing,
            so local volume is controlled by monitorGain, not the element's muted attr. */}
        <video
          ref={videoShare.videoRef}
          autoPlay
          playsInline
          onClick={() => {
            if (videoShare.sourceType !== 'camera') {
              if (videoShare.isPlaying) videoShare.pause();
              else videoShare.play();
            }
          }}
          className={cn(
            'absolute inset-0 h-full w-full object-contain bg-black',
            videoShare.sourceType === 'camera' ? 'opacity-0 pointer-events-none' : 'cursor-pointer',
          )}
        />
        {/* Play-button overlay: visible when video is loaded but paused and panel is closed */}
        {videoShare.sourceType !== 'camera' &&
          videoShare.isVideoLoaded &&
          !videoShare.isPlaying &&
          !videoSourceOpen && (
            <button
              type="button"
              aria-label="Lire la vidéo"
              onClick={() => videoShare.play()}
              className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/60 text-white backdrop-blur-sm transition-opacity hover:bg-black/80"
            >
              <svg
                className="h-7 w-7 translate-x-0.5"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
          )}
        {isCameraOff && videoShare.sourceType === 'camera' && (
          <div className="absolute inset-0 bg-[#0f1117]" />
        )}

        {/* ── Top overlay ── */}
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/40 to-transparent pb-14 px-4 pt-4">
          <div className="flex items-center justify-between">
            {/* Left: home · LIVE · elapsed */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGoToDashboard}
                aria-label={t('goHome')}
                className={cn(
                  GLASS_PILL,
                  'flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/20',
                )}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </button>

              {isStarting && (
                <span className="flex items-center gap-1.5 rounded-full bg-orange-600/90 backdrop-blur-xl border border-orange-300/30 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-sm">
                  <span className="h-1.5 w-1.5 animate-spin rounded-full border border-white border-t-transparent" />
                  {t('status.starting')}
                </span>
              )}
              {isLive && (
                <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 backdrop-blur-xl border border-red-300/30 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-sm">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  LIVE
                </span>
              )}
              {isPaused && (
                <span className="flex items-center gap-1.5 rounded-full bg-yellow-600/90 backdrop-blur-xl border border-yellow-300/30 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  {t('status.paused')}
                </span>
              )}

              <span
                className={cn(
                  GLASS_PILL,
                  'rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
                )}
              >
                {elapsed}
              </span>
            </div>

            {/* Right: viewers · minimize · end */}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  GLASS_PILL,
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold',
                )}
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
                {liveCount}
              </span>

              {(isLive || isPaused) && (
                <button
                  type="button"
                  onClick={() =>
                    currentSession &&
                    void (isPaused
                      ? resumeSession(currentSession.id)
                      : pauseSession(currentSession.id))
                  }
                  disabled={isPausing || isEnding}
                  aria-label={isPaused ? t('resumeLive') : t('pauseLive')}
                  className={cn(
                    GLASS_PILL,
                    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold',
                    isPaused
                      ? 'border-yellow-400/40 text-yellow-200 hover:bg-yellow-900/30'
                      : 'hover:bg-white/20',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {isPaused ? (
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  ) : (
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  )}
                  {isPaused ? t('resumeLive') : t('pauseLive')}
                </button>
              )}

              <button
                type="button"
                onClick={handleMinimize}
                aria-label={t('minimize')}
                className={cn(
                  GLASS_PILL,
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold hover:bg-white/20',
                )}
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="14" y="14" width="8" height="5" rx="1" />
                  <path d="M2 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M22 7V5a2 2 0 0 0-2-2h-2" />
                  <path d="M2 17v2a2 2 0 0 0 2 2h2" />
                </svg>
                {t('minimize')}
              </button>

              <button
                type="button"
                onClick={() => currentSession && void endSession(currentSession.id)}
                disabled={isEnding}
                className={cn(
                  GLASS_PILL,
                  'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold',
                  'hover:bg-red-500/20 hover:border-red-400/30 disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <span className="h-2 w-2 rounded-[2px] border border-current" />
                {isEnding ? t('status.ending') : t('stopLive')}
              </button>
            </div>
          </div>
        </div>

        {/* ── Comment panel ── */}
        {commentsOpen && (
          <LiveCommentPanel
            sendComment={sendComment}
            replyToComment={replyToComment}
            emitReaction={emitReaction}
            isSending={isSending}
            onClose={() => setCommentsOpen(false)}
          />
        )}

        {/* ── Viewers panel (sharer view with audience toggle) ── */}
        {viewersPanelOpen && currentSession && (
          <ViewersPanel
            sessionId={currentSession.id}
            apiBase={API_BASE}
            onClose={() => setViewersPanelOpen(false)}
            showAudienceToggle
            viewersVisible={viewersVisible}
            onToggleViewersVisible={(v) => void updateViewersVisibility(v)}
            isTogglingVisibility={isTogglingVisibility}
            className="absolute left-0 top-14 bottom-24 z-40 w-full border-r sm:w-80"
          />
        )}

        {/* ── Video source panel ── */}
        {videoSourceOpen && (
          <div className="absolute inset-x-3 bottom-28 z-40 flex flex-col gap-3 rounded-2xl border border-white/15 bg-black/85 p-4 backdrop-blur-2xl sm:left-auto sm:right-16 sm:w-80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">
                {t('videoShare.sourceLabel')}
              </span>
              <button
                type="button"
                onClick={() => setVideoSourceOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <VideoSourcePicker
              sourceType={videoShare.sourceType}
              recentSources={videoShare.recentSources}
              onSelectCamera={() => videoShare.switchToCamera()}
              onSelectLocalFile={(file) => videoShare.loadLocalFile(file)}
              onSelectOnlineUrl={(url) => videoShare.loadOnlineUrl(url)}
            />
            {videoShare.sourceType !== 'camera' && (
              <VideoSharePlayer
                isPlaying={videoShare.isPlaying}
                currentTime={videoShare.currentTime}
                duration={videoShare.duration}
                allowViewerControl={videoShare.allowViewerControl}
                isVideoLoaded={videoShare.isVideoLoaded}
                loadError={videoShare.loadError}
                videoVolume={videoShare.videoVolume}
                onPlay={() => videoShare.play()}
                onPause={() => videoShare.pause()}
                onSeek={(time) => videoShare.seek(time)}
                onSetSpeed={(r) => videoShare.setSpeed(r)}
                onToggleViewerControl={(allow) => void updateAllowViewerVideoControl(allow)}
                onSetVideoVolume={(vol) => videoShare.setVideoVolume(vol)}
              />
            )}

            {/* Stream quality selector */}
            <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                {t('quality.streamLabel')}
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {VIDEO_QUALITY_PRESETS.map((preset) => {
                  const isSelected = videoQualityId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setVideoQualityId(preset.id);
                        void setVideoBitrate(preset.bitrate);
                      }}
                      className={cn(
                        'flex flex-col items-center rounded-xl border px-1.5 py-2 text-center text-[10px] transition-colors',
                        isSelected
                          ? 'border-brand/60 bg-brand/20 text-brand'
                          : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      <span className="font-semibold">{preset.label}</span>
                      <span className="leading-tight text-white/40">{preset.subLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Right side: action buttons + floating reactions ── */}
        <div className="absolute bottom-28 right-3 flex flex-col items-center gap-3">
          <div className="pointer-events-none relative h-44 w-12 overflow-visible">
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

          {/* Chat toggle */}
          <button
            type="button"
            onClick={() => {
              setCommentsOpen((o) => !o);
              setViewersPanelOpen(false);
            }}
            className={cn(
              'relative flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border backdrop-blur-xl shadow-lg transition-all active:scale-90',
              commentsOpen
                ? 'bg-brand/60 border-brand/70 text-white shadow-brand/20'
                : 'bg-black/45 border-white/20 text-white shadow-black/20',
            )}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <span className="text-[9px] font-semibold leading-none">Chat</span>
            {unreadCount > 0 && !commentsOpen && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold leading-none text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Like */}
          <button
            type="button"
            onClick={fireReaction}
            className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/20 bg-black/45 backdrop-blur-xl text-white shadow-lg shadow-black/20 transition-transform active:scale-90"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
            <span className="text-[9px] font-semibold leading-none">Like</span>
          </button>

          {/* Share */}
          <button
            type="button"
            aria-label={t('share.button')}
            onClick={() => void handleShare()}
            className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/20 bg-black/45 backdrop-blur-xl text-white shadow-lg shadow-black/20 transition-transform active:scale-90"
          >
            {shareCopied ? (
              <svg
                className="h-5 w-5 text-green-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            )}
            <span
              className={cn(
                'text-[9px] font-semibold leading-none',
                shareCopied && 'text-green-400',
              )}
            >
              {shareCopied ? t('share.copied') : t('share.button')}
            </span>
          </button>

          {/* HLS stream link — shown once the platform stream is live */}
          {platformHlsUrl && (
            <button
              type="button"
              aria-label="Copy HLS stream URL"
              onClick={() => void navigator.clipboard.writeText(platformHlsUrl)}
              className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/20 bg-black/45 backdrop-blur-xl text-white shadow-lg shadow-black/20 transition-transform active:scale-90"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              <span className="text-[9px] font-semibold leading-none">HLS</span>
            </button>
          )}

          {/* WebRTC WHEP viewer link — sub-500 ms playback URL */}
          {platformWhepUrl && (
            <button
              type="button"
              aria-label="Copy WebRTC viewer URL"
              onClick={() => {
                void navigator.clipboard.writeText(platformWhepUrl);
                setWhepCopied(true);
                setTimeout(() => setWhepCopied(false), 2500);
              }}
              className={cn(
                'flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border backdrop-blur-xl shadow-lg shadow-black/20 transition-transform active:scale-90',
                whepCopied
                  ? 'border-green-400/40 bg-green-900/50 text-green-300'
                  : 'border-white/20 bg-black/45 text-white',
              )}
            >
              {whepCopied ? (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              )}
              <span
                className={cn(
                  'text-[9px] font-semibold leading-none',
                  whepCopied && 'text-green-300',
                )}
              >
                {whepCopied ? 'Copied' : 'RTC'}
              </span>
            </button>
          )}

          {/* Recording toggle — visible only when live */}
          {isLive && (
            <button
              type="button"
              aria-label={isRecording ? t('recording.stop') : t('recording.start')}
              onClick={() => currentSession && void toggleRecording(currentSession.id)}
              disabled={isTogglingRecording}
              className={cn(
                'flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border backdrop-blur-xl shadow-lg transition-all active:scale-90',
                isRecording
                  ? 'border-red-500/60 bg-red-950/70 text-red-300 shadow-red-900/30'
                  : 'border-white/20 bg-black/45 text-white shadow-black/20',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {isRecording ? (
                <svg
                  className="h-5 w-5 animate-pulse"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="8" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="8" />
                </svg>
              )}
              <span
                className={cn(
                  'text-[9px] font-semibold leading-none',
                  isRecording && 'text-red-300',
                )}
              >
                {isRecording ? t('recording.active') : t('recording.start')}
              </span>
            </button>
          )}

          {/* Video source toggle */}
          <button
            type="button"
            onClick={() => {
              setVideoSourceOpen((o) => !o);
              setCommentsOpen(false);
              setViewersPanelOpen(false);
            }}
            aria-label={t('videoShare.sourceLabel')}
            className={cn(
              'flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border backdrop-blur-xl shadow-lg transition-all active:scale-90',
              videoSourceOpen || videoShare.sourceType !== 'camera'
                ? 'border-purple-400/40 bg-purple-900/50 text-purple-300 shadow-purple-900/20'
                : 'border-white/20 bg-black/45 text-white shadow-black/20',
            )}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span className="text-[9px] font-semibold leading-none">
              {t('videoShare.sourceLabel')}
            </span>
          </button>

          {/* Viewers panel toggle */}
          <button
            type="button"
            onClick={() => {
              setViewersPanelOpen((o) => !o);
              setCommentsOpen(false);
            }}
            aria-label={viewersPanelOpen ? t('viewers.hideAudience') : t('viewers.showAudience')}
            className={cn(
              'flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border backdrop-blur-xl shadow-lg transition-all active:scale-90',
              viewersPanelOpen
                ? 'border-blue-400/40 bg-blue-900/50 text-blue-300 shadow-blue-900/20'
                : 'border-white/20 bg-black/45 text-white shadow-black/20',
            )}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            {/* Audience-visibility dot */}
            <span className="relative flex items-center gap-0.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  viewersVisible ? 'bg-green-400' : 'bg-white/30',
                )}
              />
              <span className="text-[9px] font-semibold leading-none">{t('viewers.panel')}</span>
            </span>
          </button>
        </div>

        {/* ── Floating comment bubbles — hidden when panel is open ── */}
        {!commentsOpen && (
          <div className="absolute bottom-28 left-3 flex flex-col-reverse gap-1.5">
            {overlayComments.map((c) => (
              <LiveCommentFloat key={c.id} comment={c} animate={isNewComment(c)} />
            ))}
          </div>
        )}

        {/* ── Bottom controls ── */}
        {/* pointer-events-none on the gradient so right-side buttons remain clickable through the transparent region */}
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-4 pb-6 pt-24 sm:px-6 transition-all duration-300',
            bottomControlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3',
          )}
        >
          {/* Volume sliders — glass pill */}
          <div className="pointer-events-auto mb-5 flex justify-center">
            <div className="flex items-center gap-6 rounded-2xl border border-white/20 bg-black/40 px-5 py-3 backdrop-blur-xl sm:gap-10">
              {/* Mic */}
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 flex-shrink-0 text-white/50"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={micVolume}
                  onChange={(e) => setMicVolume(Number(e.target.value))}
                  aria-label={t('volume.mic')}
                  className="h-1 w-20 cursor-pointer accent-white sm:w-28"
                />
                <span className="w-7 text-right text-[10px] tabular-nums text-white/40">
                  {micVolume}%
                </span>
              </div>

              {/* Monitor */}
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 flex-shrink-0 text-white/50"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={speakerVolume}
                  onChange={(e) => setSpeakerVolume(Number(e.target.value))}
                  aria-label={t('volume.monitor')}
                  className="h-1 w-20 cursor-pointer accent-white sm:w-28"
                />
                <span className="w-7 text-right text-[10px] tabular-nums text-white/40">
                  {speakerVolume}%
                </span>
              </div>
            </div>
          </div>

          {/* Media controls */}
          <div className="pointer-events-auto flex items-center justify-center gap-4">
            {/* Mic toggle */}
            <button
              type="button"
              onClick={toggleMic}
              aria-label={isMicMuted ? t('camera.unmute') : t('camera.mute')}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-xl transition-colors',
                isMicMuted
                  ? 'border-red-400/50 bg-red-900/60 text-red-200'
                  : 'border-white/20 bg-black/45 text-white hover:bg-black/55',
              )}
            >
              {isMicMuted ? (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
                  <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 20v4M8 20h8" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
                </svg>
              )}
            </button>

            {/* Camera toggle */}
            <button
              type="button"
              onClick={toggleCamera}
              aria-label={isCameraOff ? t('camera.showCamera') : t('camera.hideCamera')}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-xl transition-colors',
                isCameraOff
                  ? 'border-red-400/50 bg-red-900/60 text-red-200'
                  : 'border-white/20 bg-black/45 text-white hover:bg-black/55',
              )}
            >
              {isCameraOff ? (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10M1 1l22 22" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
              )}
            </button>

            {/* Pause / Resume */}
            {(isLive || isPaused) && (
              <button
                type="button"
                onClick={() =>
                  currentSession &&
                  void (isPaused
                    ? resumeSession(currentSession.id)
                    : pauseSession(currentSession.id))
                }
                disabled={isPausing || isEnding}
                aria-label={isPaused ? t('resumeLive') : t('pauseLive')}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-xl transition-colors',
                  isPaused
                    ? 'border-yellow-400/50 bg-yellow-900/60 text-yellow-200 hover:bg-yellow-800/70'
                    : 'border-white/20 bg-black/45 text-white hover:bg-black/55',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {isPaused ? (
                  // Play / resume icon
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                ) : (
                  // Pause icon
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                )}
              </button>
            )}

            {/* End stream */}
            <button
              type="button"
              onClick={() => currentSession && void endSession(currentSession.id)}
              disabled={isEnding}
              className={cn(
                'flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-7 py-3 text-sm font-semibold text-white backdrop-blur-xl transition-colors',
                'hover:border-red-400/50 hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              <span className="h-3.5 w-3.5 flex-shrink-0 rounded-[3px] border-2 border-current" />
              {isEnding ? t('status.ending') : t('stopLive')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
