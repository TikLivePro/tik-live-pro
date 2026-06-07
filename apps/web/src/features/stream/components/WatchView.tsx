'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Hls from 'hls.js';
import { useTranslations } from 'next-intl';
import { io as socketIo, type Socket } from 'socket.io-client';

import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text.utils';
import { API_BASE, COMMENTS_WS_URL, apiFetch } from '@/lib/api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { LiveReactionFloat } from './LiveReactionFloat';
import { ViewersPanel } from './ViewersPanel';
import type { Comment } from '@tik-live-pro/shared-types';

const WEBRTC_BASE =
  process.env.NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL ?? 'http://localhost:8889';
const POLL_INTERVAL = 5000;
const REACTION_EMOJIS = ['❤️', '🔥', '😍', '👏', '💯', '🎉'];
const MAX_FLOATING = 5;
const MAX_REACTIONS = 20;

interface LiveReaction {
  id: string;
  emoji: string;
  left: number;
}

function toWhepUrl(hlsUrl: string): string | null {
  try {
    const { pathname } = new URL(hlsUrl);
    const key = pathname.split('/live/')[1]?.split('/')[0];
    if (!key) return null;
    return `${WEBRTC_BASE}/live/${key}/whep`;
  } catch {
    return null;
  }
}

export interface PublicSession {
  id: string;
  title: string;
  status: 'created' | 'starting' | 'live' | 'paused' | 'ending' | 'ended' | 'error';
  platforms: ('tiktok' | 'facebook')[];
  platformHlsUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  viewersVisible?: boolean;
  viewerCount?: number;
}

// ── Video players ─────────────────────────────────────────────

function HlsPlayer({ src, title }: { src: string; title: string }): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }
    if (!Hls.isSupported()) return;
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      liveSyncDuration: 1,
      liveMaxLatencyDuration: 5,
      maxBufferLength: 5,
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    return () => hls.destroy();
  }, [src]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute inset-0 h-full w-full object-cover"
      aria-label={title}
    />
  );
}

function WhepPlayer({
  src,
  title,
  onError,
}: {
  src: string;
  title: string;
  onError: () => void;
}): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; });

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (event) => {
      if (event.streams.length > 0 && event.streams[0]) {
        video.srcObject = event.streams[0];
      } else {
        if (!(video.srcObject instanceof MediaStream)) {
          video.srcObject = new MediaStream();
        }
        (video.srcObject as MediaStream).addTrack(event.track);
      }
    };

    const fallbackTimer = setTimeout(() => onErrorRef.current(), 8000);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') clearTimeout(fallbackTimer);
      if (pc.connectionState === 'failed') {
        clearTimeout(fallbackTimer);
        onErrorRef.current();
      }
    };

    let closed = false;

    async function connect(): Promise<void> {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const handler = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', handler);
            resolve();
          }
        };
        pc.addEventListener('icegatheringstatechange', handler);
        setTimeout(resolve, 1500);
      });
      if (closed) return;
      const res = await fetch(src, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription?.sdp ?? '',
      });
      if (!res.ok) throw new Error(`WHEP ${res.status}`);
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
    }

    connect().catch(() => onErrorRef.current());

    return () => {
      closed = true;
      clearTimeout(fallbackTimer);
      pc.close();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute inset-0 h-full w-full object-cover"
      aria-label={title}
    />
  );
}

// ── Floating comment bubble ───────────────────────────────────

const PLATFORM_DOT: Record<string, string> = {
  tiktok: 'bg-[#ff0050]',
  facebook: 'bg-[#1877f2]',
};

function CommentBubble({
  comment,
  animate,
}: {
  comment: Comment;
  animate?: boolean;
}): React.ReactElement {
  const dot = PLATFORM_DOT[comment.platform] ?? 'bg-white/40';
  return (
    <div
      className={cn(
        'flex max-w-[230px] items-start gap-2 rounded-2xl border border-white/15 bg-black/60 px-3 py-2 shadow-lg backdrop-blur-lg',
        animate && 'animate-slide-comment',
      )}
    >
      <div className="relative mt-0.5 shrink-0">
        <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white/20 text-[9px] font-bold text-white">
          {getInitials(comment.authorName)}
        </div>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-black/50',
            dot,
          )}
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-white/80">
          {comment.authorName}
        </p>
        {comment.content && (
          <p className="line-clamp-2 break-words text-xs leading-snug text-white">
            {comment.content}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Auth gate modal ───────────────────────────────────────────

function AuthGateModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const t = useTranslations('watch');
  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 pb-16 backdrop-blur-sm sm:items-center sm:pb-0"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-xs rounded-2xl border border-white/15 bg-[#111]/95 p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-4xl" aria-hidden="true">🔒</div>
        <p className="mb-1 text-base font-semibold text-white">{t('signInToInteract')}</p>
        <p className="mb-5 text-xs text-white/50">{t('signInDesc')}</p>
        <Link
          href="/auth/login"
          className="block w-full rounded-xl bg-brand py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          {t('signIn')}
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl py-2 text-sm text-white/40 transition-colors hover:text-white/70"
        >
          {t('notNow')}
        </button>
      </div>
    </div>
  );
}

// ── Platform icons ────────────────────────────────────────────

function TikTokIcon(): React.ReactElement {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
    </svg>
  );
}

function FacebookIcon(): React.ReactElement {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

// ── WatchView ─────────────────────────────────────────────────

interface Props {
  initialSession: PublicSession;
  apiBase: string;
}

export function WatchView({ initialSession, apiBase }: Props): React.ReactElement {
  const t = useTranslations('watch');
  const tStream = useTranslations('stream');

  const { isAuthenticated, accessToken, displayName } = useAuthStore();

  const [session, setSession] = useState<PublicSession>(initialSession);
  const [whepFailed, setWhepFailed] = useState(false);

  // Panel visibility
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [authGateOpen, setAuthGateOpen] = useState(false);

  // Interactions
  const [localLiked, setLocalLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);

  // Comments local state (independent of the sharer's stream store)
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Reactions
  const [liveReactions, setLiveReactions] = useState<LiveReaction[]>([]);

  const commentListRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const mountedAtRef = useRef(Date.now());
  const socketRef = useRef<Socket | null>(null);

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
    if (curr > prev) {
      setUnreadCount((n) => n + curr - prev);
    }
  }, [comments, commentsOpen]);

  const isLive = session.status === 'live';
  const isPaused = session.status === 'paused';
  const isEnded = ['ended', 'error', 'ending'].includes(session.status);
  const isStarting = ['starting', 'created'].includes(session.status);

  const elapsed = useElapsedTime(
    isLive && session.startedAt ? new Date(session.startedAt) : null,
  );

  // Poll session status
  useEffect(() => {
    if (isEnded) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/sessions/${session.id}/public`);
        if (!res.ok) return;
        const { data } = (await res.json()) as { data: PublicSession };
        setSession(data);
      } catch {
        // ignore transient failures
      }
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [session.id, isEnded, apiBase]);

  // Load historical comments when the session goes live (or on first render if already live).
  // GET /comments is publicly readable so this works for unauthenticated viewers too.
  useEffect(() => {
    if (!isLive) return;
    void fetch(`${API_BASE}/comments?sessionId=${session.id}&pageSize=50`)
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { data: { items: Comment[] } };
        const items = body.data.items;
        if (items.length > 0) setComments(items);
      })
      .catch(() => {});
  }, [isLive, session.id]);

  // Comments socket — read-only if unauthenticated, send-capable if authenticated.
  // accessToken is intentionally excluded from deps: we don't want to reconnect on every
  // token refresh and lose events. The initial token value is captured at connect time,
  // which is sufficient because the comments service does not re-verify the token after
  // the handshake.
  useEffect(() => {
    if (!isLive) return;

    const token = useAuthStore.getState().accessToken;
    const socket = socketIo(COMMENTS_WS_URL, {
      ...(token ? { auth: { token } } : {}),
      query: { sessionId: session.id },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
    });

    socket.on('comment', (comment: Comment) => {
      setComments((prev) => [comment, ...prev].slice(0, 100));
    });

    socket.on('reaction', (data: { emoji: string }) => {
      const reaction: LiveReaction = {
        id: crypto.randomUUID(),
        emoji: data.emoji,
        left: Math.floor(Math.random() * 36),
      };
      setLiveReactions((prev) => [...prev, reaction].slice(-MAX_REACTIONS));
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, isLive]);

  const removeReaction = useCallback((id: string) => {
    setLiveReactions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleLike = useCallback(() => {
    if (!isAuthenticated) {
      setAuthGateOpen(true);
      return;
    }
    const wasLiked = localLiked;
    setLocalLiked(!wasLiked);
    setLikeCount((prev) => prev + (wasLiked ? -1 : 1));
    if (!wasLiked) {
      const emoji = REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)] ?? '❤️';
      // Show local animation immediately; broadcast to all other viewers via socket
      setLiveReactions((prev) =>
        [
          ...prev,
          { id: crypto.randomUUID(), emoji, left: Math.floor(Math.random() * 36) },
        ].slice(-MAX_REACTIONS),
      );
      socketRef.current?.emit('emit_reaction', { emoji });
    }
  }, [isAuthenticated, localLiked]);

  const handleCommentToggle = useCallback(() => {
    setCommentsOpen((prev) => !prev);
    setViewersOpen(false);
  }, []);

  const handleViewersToggle = useCallback(() => {
    setViewersOpen((prev) => !prev);
    setCommentsOpen(false);
  }, []);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/watch/${session.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: session.title, url });
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      // clipboard denied
    }
  }, [session.id, session.title]);

  const handleSendComment = useCallback(async () => {
    const trimmed = commentText.trim();
    if (!trimmed || isSending) return;
    if (!isAuthenticated) {
      setAuthGateOpen(true);
      return;
    }
    setIsSending(true);
    try {
      await apiFetch(`${API_BASE}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          content: trimmed,
          ...(displayName ? { authorName: displayName } : {}),
        }),
      });
      setCommentText('');
    } catch {
      // ignore
    } finally {
      setIsSending(false);
    }
  }, [commentText, isSending, isAuthenticated, session.id, displayName]);

  // Auto-scroll comment list to top when new comment arrives
  useEffect(() => {
    if (commentListRef.current) {
      commentListRef.current.scrollTop = 0;
    }
  }, [comments.length]);

  function isNewComment(comment: Comment): boolean {
    const ts = comment.receivedAt;
    const ms = ts instanceof Date
      ? ts.getTime()
      : new Date(ts as unknown as string).getTime();
    return ms > mountedAtRef.current - 500;
  }

  const anyPanelOpen = commentsOpen || viewersOpen;
  const recentFloating = comments.slice(0, MAX_FLOATING);

  // ── Video renderer ─────────────────────────────────────────
  const renderVideo = (): React.ReactElement | null => {
    if (!session.platformHlsUrl) return null;
    const whepUrl = toWhepUrl(session.platformHlsUrl);
    const useWhep =
      !!whepUrl && !whepFailed && typeof RTCPeerConnection !== 'undefined';
    return useWhep ? (
      <WhepPlayer
        src={whepUrl}
        title={session.title}
        onError={() => setWhepFailed(true)}
      />
    ) : (
      <HlsPlayer src={session.platformHlsUrl} title={session.title} />
    );
  };

  const hasVideo = (isLive || isPaused) && !!session.platformHlsUrl;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* ── Video background ── */}
      {hasVideo && renderVideo()}
      {!hasVideo && <div className="absolute inset-0 bg-[#0a0b0f]" />}

      {/* Ambient glow when live */}
      {isLive && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 40% at 50% 0%, hsl(4 82% 55% / 0.12) 0%, transparent 70%)',
          }}
        />
      )}

      {/* Gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black/80 to-transparent" />

      {/* ── Top bar ── */}
      <header
        className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-4 sm:px-6"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))' }}
      >
        {/* Logo */}
        <Link
          href="/auth/login"
          className="flex shrink-0 items-center gap-1.5 text-white/80 transition-colors hover:text-white"
        >
          <img src="/logo.png" alt="TikLivePro" className="h-6 w-6 object-contain" />
          <span className="hidden text-sm font-bold tracking-tight sm:inline">TikLivePro</span>
        </Link>

        {/* Title */}
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90 sm:text-base">
          {session.title}
        </h1>

        {/* Status + viewer count */}
        <div className="flex shrink-0 items-center gap-2">
          {isLive && (
            <span className="flex items-center gap-1.5 rounded-full border border-red-300/30 bg-red-600/90 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-xl">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              LIVE
            </span>
          )}
          {isPaused && (
            <span className="rounded-full border border-yellow-300/30 bg-yellow-600/80 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-xl">
              {tStream('status.paused')}
            </span>
          )}
          {isStarting && (
            <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/70 backdrop-blur-xl">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60" />
              {tStream('status.starting')}
            </span>
          )}

          {/* Viewer count — clickable if viewersVisible */}
          <button
            type="button"
            onClick={() => session.viewersVisible && handleViewersToggle()}
            className={cn(
              'flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-xs font-semibold text-white/70 backdrop-blur-xl transition-colors',
              session.viewersVisible
                ? 'cursor-pointer hover:bg-white/10 hover:text-white'
                : 'cursor-default',
            )}
          >
            <svg
              className="h-3.5 w-3.5"
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
            {session.viewerCount ?? 0}
          </button>
        </div>
      </header>

      {/* ── Non-live centered state ── */}
      {!isLive && !isPaused && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <div
            className={cn(
              'flex h-20 w-20 items-center justify-center rounded-2xl border transition-all',
              isEnded
                ? 'border-white/10 bg-white/5 text-white/30'
                : 'border-white/10 bg-white/5 text-white/40',
            )}
          >
            {isStarting && (
              <svg
                className="h-7 w-7 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
            )}
            {isEnded && (
              <svg
                className="h-8 w-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            )}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-white sm:text-2xl">{session.title}</h2>
            {isStarting && (
              <p className="text-sm text-white/50">{t('startingDesc')}</p>
            )}
            {isEnded && (
              <p className="text-sm text-white/50">{t('endedDesc')}</p>
            )}
          </div>

          {/* Platform badges */}
          {session.platforms.length > 0 && (
            <div className="flex items-center gap-2">
              {session.platforms.includes('tiktok') && (
                <span className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/60">
                  <TikTokIcon />
                  TikTok
                </span>
              )}
              {session.platforms.includes('facebook') && (
                <span className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/60">
                  <FacebookIcon />
                  Facebook
                </span>
              )}
            </div>
          )}

          <Link
            href="/auth/login"
            className="mt-1 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <img src="/logo.png" alt="" className="h-4 w-4 object-contain" />
            {t('goToApp')}
          </Link>
        </div>
      )}

      {/* ── Paused overlay ── */}
      {isPaused && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <span className="rounded-2xl border border-yellow-300/30 bg-black/60 px-5 py-3 text-sm font-bold text-yellow-200 backdrop-blur-xl">
            {tStream('status.paused')}
          </span>
        </div>
      )}

      {/* ── Live interaction layer ── */}
      {isLive && (
        <>
          {/* Floating comments — hidden when any panel is open */}
          {!anyPanelOpen && (
            <div className="absolute bottom-28 left-3 z-20 flex flex-col-reverse gap-1.5">
              {recentFloating.map((c) => (
                <CommentBubble key={c.id} comment={c} animate={isNewComment(c)} />
              ))}
            </div>
          )}

          {/* Right action rail — hidden when any panel is open */}
          {!anyPanelOpen && (
            <div className="absolute bottom-24 right-3 z-20 flex flex-col items-center gap-3">
              {/* Reaction floats */}
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

              {/* Like */}
              <button
                type="button"
                onClick={handleLike}
                aria-label={t('like')}
                className={cn(
                  'flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border backdrop-blur-xl shadow-lg transition-all active:scale-90',
                  localLiked
                    ? 'border-pink-400/40 bg-pink-900/50 text-pink-400 shadow-pink-900/20'
                    : 'border-white/20 bg-black/45 text-white shadow-black/20',
                )}
              >
                <svg
                  className={cn('h-5 w-5 transition-transform', localLiked && 'scale-110')}
                  viewBox="0 0 24 24"
                  fill={localLiked ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
                <span
                  className={cn(
                    'text-[9px] font-semibold leading-none',
                    localLiked && 'text-pink-400',
                  )}
                >
                  {likeCount > 0 ? likeCount.toLocaleString() : t('like')}
                </span>
              </button>

              {/* Comment */}
              <button
                type="button"
                onClick={handleCommentToggle}
                aria-label={t('comment')}
                className={cn(
                  'relative flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border backdrop-blur-xl shadow-lg transition-all active:scale-90',
                  commentsOpen
                    ? 'border-brand/50 bg-brand/60 text-white'
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
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <span className="text-[9px] font-semibold leading-none">
                  {comments.length > 0 ? comments.length.toLocaleString() : t('comment')}
                </span>
                {unreadCount > 0 && !commentsOpen && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold leading-none text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Share */}
              <button
                type="button"
                onClick={() => void handleShare()}
                aria-label={t('share')}
                className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/20 bg-black/45 text-white shadow-lg shadow-black/20 backdrop-blur-xl transition-all active:scale-90"
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
                  {shareCopied ? '✓' : t('share')}
                </span>
              </button>

              {/* Viewers — only if sharer allows */}
              {session.viewersVisible && (
                <button
                  type="button"
                  onClick={handleViewersToggle}
                  aria-label={t('viewers')}
                  className={cn(
                    'flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-2xl border backdrop-blur-xl shadow-lg transition-all active:scale-90',
                    viewersOpen
                      ? 'border-blue-400/40 bg-blue-900/50 text-blue-300'
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
                  <span className="text-[9px] font-semibold leading-none">
                    {t('viewers')}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* ── Comment bottom sheet ── */}
          {commentsOpen && (
            <div
              className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-3xl border-t border-white/15 bg-black/90 backdrop-blur-2xl"
              style={{ height: '62%' }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3">
                <div className="h-1 w-8 rounded-full bg-white/20" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 text-white/50"
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
                  <span className="text-sm font-semibold text-white">{t('comments')}</span>
                  {comments.length > 0 && (
                    <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
                      {comments.length}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setCommentsOpen(false)}
                  aria-label="Close"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <svg
                    className="h-4 w-4"
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

              {/* Comment list */}
              <div ref={commentListRef} className="flex-1 overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="mt-10 text-center text-xs text-white/30">
                    {t('noComments')}
                  </p>
                ) : (
                  <div className="py-1">
                    {comments.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-start gap-2.5 px-4 py-2"
                      >
                        <div className="relative mt-0.5 shrink-0">
                          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-white/15 text-[9px] font-bold text-white">
                            {getInitials(c.authorName)}
                          </div>
                          <span
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-black/40',
                              PLATFORM_DOT[c.platform] ?? 'bg-white/30',
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-white/60">
                            {c.authorName}
                          </p>
                          <p className="break-words text-xs leading-snug text-white">
                            {c.content}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Input row */}
              <div
                className="border-t border-white/10 px-3 py-3"
                style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}
              >
                {isAuthenticated ? (
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/70 text-[10px] font-bold text-white">
                      {getInitials(displayName ?? 'You')}
                    </div>
                    <input
                      ref={commentInputRef}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendComment();
                        }
                      }}
                      placeholder={t('commentPlaceholder')}
                      className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-white/35 focus:bg-white/15"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSendComment()}
                      disabled={!commentText.trim() || isSending}
                      aria-label={t('send')}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand/40 bg-brand/70 text-white backdrop-blur-xl transition-opacity disabled:opacity-40"
                    >
                      {isSending ? (
                        <svg
                          className="h-4 w-4 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          aria-hidden="true"
                        >
                          <path d="M21 12a9 9 0 11-6.219-8.56" />
                        </svg>
                      ) : (
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAuthGateOpen(true)}
                    className="w-full rounded-xl border border-white/15 bg-white/8 py-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/12 hover:text-white"
                  >
                    {t('signInToInteract')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Viewers side panel ── */}
          {viewersOpen && session.viewersVisible && (
            <ViewersPanel
              sessionId={session.id}
              apiBase={apiBase}
              onClose={() => setViewersOpen(false)}
            />
          )}
        </>
      )}

      {/* Auth gate modal */}
      {authGateOpen && <AuthGateModal onClose={() => setAuthGateOpen(false)} />}

      {/* Powered-by footer (non-live only) */}
      {!isLive && (
        <footer
          className="absolute inset-x-0 bottom-0 flex justify-center"
          style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}
        >
          <p className="text-[11px] text-white/20">{t('poweredBy')}</p>
        </footer>
      )}
    </div>
  );
}

// ── WatchNotFound ─────────────────────────────────────────────

export function WatchNotFound(): React.ReactElement {
  const t = useTranslations('watch');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#090b0f] px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/20">
        <svg
          className="h-8 w-8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-white">{t('notFound')}</h1>
        <p className="max-w-xs text-sm text-white/40">{t('notFoundDesc')}</p>
      </div>
      <Link
        href="/auth/login"
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <img src="/logo.png" alt="" className="h-4 w-4 object-contain" />
        {t('goToApp')}
      </Link>
      <p className="text-[11px] text-white/20">{t('poweredBy')}</p>
    </div>
  );
}
