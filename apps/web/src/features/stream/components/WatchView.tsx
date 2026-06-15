'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import Hls from 'hls.js';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { io as socketIo, type Socket } from 'socket.io-client';

import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text.utils';
import { API_BASE, COMMENTS_WS_URL, apiFetch } from '@/lib/api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { InlineAuthModal } from '@/features/auth/components/InlineAuthModal';
import { EmojiPickerPopover } from '@/features/comments/components/EmojiPickerPopover';
import { GifPickerPopover } from '@/features/comments/components/GifPickerPopover';
import { CommentReactionPicker } from '@/features/comments/components/CommentReactionPicker';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { LiveReactionFloat } from './LiveReactionFloat';
import { ViewersPanel } from './ViewersPanel';
import { ViewerVideoControls } from './ViewerVideoControls';
import type { ViewerVideoState } from './ViewerVideoControls';
import type { Comment } from '@tik-live-pro/shared-types';

const WEBRTC_BASE =
  process.env.NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL ?? 'http://localhost:8889';
// Adaptive polling: fast while stream is starting/transitioning, slow once stable.
// 100 viewers × 4 polls/min (live) = 400 req/min vs 1200 req/min with a fixed 5s interval.
const POLL_INTERVAL_STARTING_MS = 3000;
const POLL_INTERVAL_LIVE_MS = 15000;
const POLL_INTERVAL_MAX_MS = 30000;
const REACTION_EMOJIS = ['❤️', '🔥', '😍', '👏', '💯', '🎉'];
const MAX_FLOATING = 5;
const MAX_REACTIONS = 20;

const GUEST_ADJECTIVES = ['Swift', 'Lucky', 'Bold', 'Brave', 'Cool', 'Quick', 'Wild', 'Clever', 'Sharp', 'Bright'];
const GUEST_ANIMALS = ['Fox', 'Eagle', 'Tiger', 'Wolf', 'Bear', 'Hawk', 'Lion', 'Panda', 'Lynx', 'Shark'];
const GUEST_NAME_KEY = 'tiklivepro:guest:name';

function getOrCreateGuestName(): string {
  try {
    const stored = sessionStorage.getItem(GUEST_NAME_KEY);
    if (stored) return stored;
    const adj = GUEST_ADJECTIVES[Math.floor(Math.random() * GUEST_ADJECTIVES.length)] ?? 'Guest';
    const animal = GUEST_ANIMALS[Math.floor(Math.random() * GUEST_ANIMALS.length)] ?? 'Viewer';
    const num = Math.floor(Math.random() * 99) + 1;
    const name = `${adj}${animal}${num}`;
    sessionStorage.setItem(GUEST_NAME_KEY, name);
    return name;
  } catch {
    return 'GuestViewer';
  }
}

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
  allowViewerVideoControl?: boolean;
}

// ── Video players ─────────────────────────────────────────────

export interface HlsQualityLevel {
  index: number;
  height: number;
  bitrate: number;
}

function HlsPlayer({
  src,
  title,
  volume,
  isMuted,
  qualityLevel = -1,
  onQualityLevels,
  onLoadingChange,
}: {
  src: string;
  title: string;
  volume: number;
  isMuted: boolean;
  /** HLS.js level index, -1 = auto ABR */
  qualityLevel?: number;
  onQualityLevels?: (levels: HlsQualityLevel[]) => void;
  onLoadingChange?: (loading: boolean) => void;
}): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    onLoadingChange?.(true);
    const onPlaying = () => onLoadingChange?.(false);
    const onWaiting = () => onLoadingChange?.(true);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return () => {
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('waiting', onWaiting);
      };
    }
    if (!Hls.isSupported()) return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
    };
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      liveSyncDuration: 1,
      liveMaxLatencyDuration: 5,
      maxBufferLength: 30,
      maxMaxBufferLength: 30,
      startLevel: -1,
    });
    hlsRef.current = hls;
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      onQualityLevels?.(
        hls.levels.map((l, i) => ({ index: i, height: l.height, bitrate: l.bitrate })),
      );
    });
    return () => {
      hlsRef.current = null;
      hls.destroy();
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Apply quality level changes without re-mounting
  useEffect(() => {
    if (hlsRef.current) hlsRef.current.currentLevel = qualityLevel;
  }, [qualityLevel]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = isMuted;
  }, [volume, isMuted]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute inset-0 h-full w-full object-contain bg-black sm:object-cover"
      aria-label={title}
    />
  );
}

function WhepPlayer({
  src,
  title,
  onError,
  onLoadingChange,
  volume,
  isMuted,
}: {
  src: string;
  title: string;
  onError: () => void;
  onLoadingChange?: (loading: boolean) => void;
  volume: number;
  isMuted: boolean;
}): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = isMuted;
  }, [volume, isMuted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    onLoadingChange?.(true);
    const onPlaying = () => onLoadingChange?.(false);
    const onWaiting = () => onLoadingChange?.(true);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);

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
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute inset-0 h-full w-full object-contain bg-black sm:object-cover"
      aria-label={title}
    />
  );
}

// ── Floating comment bubble ───────────────────────────────────

const PLATFORM_DOT: Record<string, string> = {
  tiktok: 'bg-[#ff0050]',
  facebook: 'bg-[#1877f2]',
};

const IS_IMAGE_URL = (url: string) =>
  url.startsWith('data:image') ||
  url.includes('giphy.com') ||
  /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url);

function CommentBubble({
  comment,
  animate,
  onClick,
}: {
  comment: Comment;
  animate?: boolean;
  onClick?: () => void;
}): React.ReactElement {
  const dot = PLATFORM_DOT[comment.platform] ?? 'bg-white/40';
  const mediaUrls = comment.mediaUrls ?? [];
  const imageUrl = mediaUrls.find(IS_IMAGE_URL);
  const fileCount = mediaUrls.filter((u) => !IS_IMAGE_URL(u)).length;

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex max-w-[230px] items-start gap-2 rounded-2xl border border-white/15 bg-black/60 px-3 py-2 shadow-lg backdrop-blur-lg',
        animate && 'animate-float-comment',
        onClick && 'cursor-pointer hover:bg-black/75 transition-colors',
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
        {comment.replyToCommentId && (
          <p className="text-[9px] text-white/40 leading-tight mb-0.5">↩ reply</p>
        )}
        {comment.content && (
          <p className="line-clamp-2 break-words text-xs leading-snug text-white">
            {comment.content}
          </p>
        )}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="attachment"
            className="mt-1 rounded-lg max-h-20 max-w-[120px] object-cover"
            loading="lazy"
          />
        )}
        {fileCount > 0 && (
          <p className="text-[9px] text-white/50 mt-0.5">
            📎 {fileCount} file{fileCount > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Auth gate modal ───────────────────────────────────────────

function AuthGateModal({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }): React.ReactElement {
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
        <button
          type="button"
          onClick={onSignIn}
          className="block w-full rounded-xl bg-brand py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          {t('signIn')}
        </button>
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

  const pathname = usePathname();
  const { isAuthenticated, accessToken, displayName, email } = useAuthStore();

  // Stable guest name for unauthenticated viewers, persisted per browser session
  const [guestName] = useState(() => getOrCreateGuestName());
  // Authenticated: use display name → email prefix; unauthenticated: random guest name
  const viewerDisplayName = displayName ?? (email ? email.split('@')[0] : null) ?? guestName;

  const [session, setSession] = useState<PublicSession>(initialSession);
  // Live viewer count and public viewer list pushed from socket
  const [socketViewerCount, setSocketViewerCount] = useState(initialSession.viewerCount ?? 0);
  const [publicViewerNames, setPublicViewerNames] = useState<string[]>([]);
  const [whepFailed, setWhepFailed] = useState(false);
  const [whepKey, setWhepKey] = useState(0);

  // Viewer quality selection
  const [hlsLevels, setHlsLevels] = useState<HlsQualityLevel[]>([]);
  const [hlsQualityLevel, setHlsQualityLevel] = useState(-1); // -1 = auto
  const [qualityPickerOpen, setQualityPickerOpen] = useState(false);
  // When true, skip WHEP and use HLS (lets viewer reduce bandwidth on slow connections)
  const [forceLowBandwidth, setForceLowBandwidth] = useState(false);

  // Video loading state — true while the player is connecting/buffering before first frame
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  useEffect(() => {
    if (session.platformHlsUrl) setIsVideoLoading(true);
  }, [session.platformHlsUrl, whepFailed, forceLowBandwidth, whepKey]);

  // Panel visibility
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [authLoginOpen, setAuthLoginOpen] = useState(false);

  // Interactions
  const [localLiked, setLocalLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);

  // Comments local state (independent of the sharer's stream store)
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [attachments, setAttachments] = useState<Array<{ url: string; name?: string }>>([]);
  const [commentReactions, setCommentReactions] = useState<Record<string, Record<string, number>>>({});
  const [myCommentReactions, setMyCommentReactions] = useState<Record<string, string>>({});
  const myCommentReactionsRef = useRef(myCommentReactions);
  myCommentReactionsRef.current = myCommentReactions;

  // Whether this specific viewer has been granted video control by the streamer
  const [myVideoControlAllowed, setMyVideoControlAllowed] = useState(false);

  // Reactions
  const [liveReactions, setLiveReactions] = useState<LiveReaction[]>([]);

  const commentListRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedAtRef = useRef(Date.now());
  const socketRef = useRef<Socket | null>(null);
  const pendingScrollIdRef = useRef<string | null>(null);

  const [unreadCount, setUnreadCount] = useState(0);
  const prevCommentLenRef = useRef(0);
  const [videoState, setVideoState] = useState<ViewerVideoState | null>(null);

  // Volume and controls visibility
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [floatingComments, setFloatingComments] = useState<Array<{ comment: Comment; key: string }>>([]);
  const floatingRemoveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  // Poll session status with adaptive interval — fast while starting, slow once stable.
  // This reduces load from 100 viewers × 12 req/min to 100 × 4 req/min when live.
  useEffect(() => {
    if (isEnded) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let consecutiveUnchanged = 0;

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`${apiBase}/sessions/${session.id}/public`);
        if (res.ok) {
          const { data } = (await res.json()) as { data: PublicSession };
          const statusChanged = data.status !== session.status;
          if (statusChanged) {
            consecutiveUnchanged = 0;
            setSession(data);
          } else {
            consecutiveUnchanged++;
          }
        }
      } catch {
        // ignore transient failures
      }

      // Back off when the stream status is stable: starting polls quickly,
      // live polls less frequently, and we cap at POLL_INTERVAL_MAX_MS.
      const baseInterval = isLive ? POLL_INTERVAL_LIVE_MS : POLL_INTERVAL_STARTING_MS;
      const delay = Math.min(baseInterval * Math.pow(1.5, Math.floor(consecutiveUnchanged / 3)), POLL_INTERVAL_MAX_MS);
      timeoutId = setTimeout(() => { void poll(); }, delay);
    };

    timeoutId = setTimeout(() => { void poll(); }, isLive ? POLL_INTERVAL_LIVE_MS : POLL_INTERVAL_STARTING_MS);
    return () => { if (timeoutId) clearTimeout(timeoutId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, isEnded, isLive, apiBase]);

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
      reconnectionAttempts: 8,
      // Jitter spreads reconnect attempts across 3–9s so 100 viewers don't all
      // hammer the server at the same instant after a restart.
      reconnectionDelay: 3000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
    });

    // Announce as viewer so the streamer can see us in the audience list
    socket.emit('join_as_viewer', { displayName: viewerDisplayName });

    socket.on('video_control_permission', (data: { allowed: boolean }) => {
      setMyVideoControlAllowed(data.allowed);
    });

    socket.on('viewer_count', (data: { count: number }) => {
      setSocketViewerCount(data.count);
    });

    socket.on('public_viewers', (data: { viewers: { displayName: string }[] }) => {
      setPublicViewerNames((data.viewers ?? []).map((v) => v.displayName));
    });

    socket.on('comment', (comment: Comment) => {
      setComments((prev) => {
        if (prev.some((c) => c.id === comment.id)) return prev;
        return [comment, ...prev].slice(0, 100);
      });
      const key = crypto.randomUUID();
      setFloatingComments((prev) => [...prev, { comment, key }].slice(-MAX_FLOATING));
      const timer = setTimeout(() => {
        setFloatingComments((prev) => prev.filter((f) => f.key !== key));
        floatingRemoveTimersRef.current.delete(key);
      }, 5200);
      floatingRemoveTimersRef.current.set(key, timer);
    });

    socket.on('reaction', (data: { emoji: string }) => {
      const reaction: LiveReaction = {
        id: crypto.randomUUID(),
        emoji: data.emoji,
        left: Math.floor(Math.random() * 36),
      };
      setLiveReactions((prev) => [...prev, reaction].slice(-MAX_REACTIONS));
    });

    socket.on('video_state', (data: ViewerVideoState) => {
      if (data.sourceType === 'camera') setVideoState(null);
      else setVideoState(data);
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
      setMyVideoControlAllowed(false);
      setSocketViewerCount(0);
      setPublicViewerNames([]);
      floatingRemoveTimersRef.current.forEach(clearTimeout);
      floatingRemoveTimersRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, isLive]);

  // Auto-retry WHEP after failure so viewers recover when the stream comes back
  useEffect(() => {
    if (!whepFailed || !isLive) return;
    const timer = setTimeout(() => {
      setWhepFailed(false);
      setWhepKey((k) => k + 1);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [whepFailed, isLive]);

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

  const scheduleHide = useCallback((): void => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3500);
  }, []);

  const showControls = useCallback((): void => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // Keep controls visible while a panel is open
  useEffect(() => {
    if (commentsOpen || viewersOpen) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setControlsVisible(true);
    }
  }, [commentsOpen, viewersOpen]);

  function handleControlAreaMouseMove(e: ReactMouseEvent<HTMLDivElement>): void {
    if (!isLive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientY > rect.bottom - rect.height * 0.3) {
      showControls();
    }
  }

  function handleControlAreaMouseLeave(): void {
    if (isLive && !anyPanelOpen) scheduleHide();
  }

  function handleVideoAreaClick(e: ReactMouseEvent<HTMLDivElement>): void {
    if (!isLive) return;
    if ((e.target as HTMLElement).closest('button, a, input, [role=button]')) return;
    setQualityPickerOpen(false);
    setControlsVisible((v) => {
      if (v && !anyPanelOpen) {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        return false;
      }
      scheduleHide();
      return true;
    });
  }

  function handleVolumeChange(val: number): void {
    setVolume(val);
    if (val === 0) setIsMuted(true);
    else setIsMuted(false);
    showControls();
  }

  function toggleMute(): void {
    setIsMuted((m) => !m);
    showControls();
  }

  const handleCommentReact = useCallback((commentId: string, emoji: string) => {
    const prevEmoji = myCommentReactionsRef.current[commentId];
    setCommentReactions((prev) => {
      const reactionMap = { ...(prev[commentId] ?? {}) };
      if (prevEmoji === emoji) {
        reactionMap[emoji] = Math.max(0, (reactionMap[emoji] ?? 1) - 1);
        if (reactionMap[emoji] === 0) delete reactionMap[emoji];
      } else {
        if (prevEmoji) {
          reactionMap[prevEmoji] = Math.max(0, (reactionMap[prevEmoji] ?? 1) - 1);
          if (reactionMap[prevEmoji] === 0) delete reactionMap[prevEmoji];
        }
        reactionMap[emoji] = (reactionMap[emoji] ?? 0) + 1;
      }
      return { ...prev, [commentId]: reactionMap };
    });
    setMyCommentReactions((prev) => {
      const updated = { ...prev };
      if (prev[commentId] === emoji) delete updated[commentId];
      else updated[commentId] = emoji;
      return updated;
    });
  }, []);

  const handleEmojiSelect = useCallback((emoji: string) => {
    setCommentText((prev) => prev + emoji);
    commentInputRef.current?.focus();
  }, []);

  const handleGifSelect = useCallback((gifUrl: string) => {
    setAttachments((prev) => [...prev, { url: gifUrl, name: 'GIF' }]);
    commentInputRef.current?.focus();
  }, []);

  const readFileAsDataUrl = (file: File): Promise<{ url: string; name: string }> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve({ url: ev.target?.result as string, name: file.name });
      reader.readAsDataURL(file);
    });

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const loaded = await Promise.all(files.map(readFileAsDataUrl));
    setAttachments((prev) => [...prev, ...loaded]);
    e.target.value = '';
  }, []);

  const handleSendComment = useCallback(async () => {
    const trimmed = commentText.trim();
    if (!trimmed && attachments.length === 0) return;
    if (isSending) return;
    if (!isAuthenticated) {
      setAuthGateOpen(true);
      return;
    }
    setIsSending(true);
    const mediaUrls = attachments.length > 0 ? attachments.map((a) => a.url) : undefined;
    try {
      let res: Response;
      if (replyingTo) {
        res = await apiFetch(`${API_BASE}/comments/${replyingTo.id}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmed, ...(mediaUrls ? { mediaUrls } : {}) }),
        });
        setReplyingTo(null);
      } else {
        res = await apiFetch(`${API_BASE}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            content: trimmed,
            ...(displayName ? { authorName: displayName } : {}),
            ...(mediaUrls ? { mediaUrls } : {}),
          }),
        });
      }
      // Optimistically add the created comment so GIFs/files appear immediately,
      // before the socket echo (which may omit mediaUrls).
      if (res.ok) {
        try {
          const body = (await res.json()) as { data: Comment };
          const created = body?.data;
          if (created?.id) {
            setComments((prev) => {
              if (prev.some((c) => c.id === created.id)) return prev;
              return [created, ...prev].slice(0, 100);
            });
          }
        } catch { /* ignore — socket will deliver the comment */ }
      }
      setCommentText('');
      setAttachments([]);
    } catch {
      // ignore
    } finally {
      setIsSending(false);
    }
  }, [commentText, attachments, isSending, isAuthenticated, session.id, displayName, replyingTo]);

  const sendVideoControl = useCallback((type: 'play' | 'pause' | 'seek', currentTime?: number) => {
    socketRef.current?.emit('video_control_request', { type, ...(currentTime !== undefined ? { currentTime } : {}) });
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────
  // Space  → play / pause   (requires allowViewerControl)
  // ←  →   → seek ±10 s     (requires allowViewerControl)
  // Guards: only fires when video is active + control is allowed + focus is NOT in a text field.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      // Don't steal keys from inputs / textareas / contenteditable elements
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      if (!myVideoControlAllowed || !videoState) return;

      if (e.code === 'Space') {
        e.preventDefault();
        sendVideoControl(videoState.playing ? 'pause' : 'play');
        showControls();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const newTime = Math.max(0, videoState.currentTime - 10);
        sendVideoControl('seek', newTime);
        showControls();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const newTime = Math.min(videoState.duration, videoState.currentTime + 10);
        sendVideoControl('seek', newTime);
        showControls();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [videoState, sendVideoControl, showControls]);

  // Auto-scroll comment list to top when new comment arrives
  useEffect(() => {
    if (commentListRef.current) {
      commentListRef.current.scrollTop = 0;
    }
  }, [comments.length]);

  // Scroll to a specific comment after the panel finishes opening
  useEffect(() => {
    if (!commentsOpen || !pendingScrollIdRef.current) return;
    const id = pendingScrollIdRef.current;
    const timer = setTimeout(() => {
      document.getElementById(`comment-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      pendingScrollIdRef.current = null;
    }, 520);
    return () => clearTimeout(timer);
  }, [commentsOpen]);


  const anyPanelOpen = viewersOpen;

  // ── Video renderer ─────────────────────────────────────────
  const renderVideo = (): React.ReactElement | null => {
    if (!session.platformHlsUrl) return null;
    const whepUrl = toWhepUrl(session.platformHlsUrl);
    const useWhep =
      !!whepUrl && !whepFailed && !forceLowBandwidth && typeof RTCPeerConnection !== 'undefined';
    return useWhep ? (
      <WhepPlayer
        key={whepKey}
        src={whepUrl}
        title={session.title}
        onError={() => setWhepFailed(true)}
        onLoadingChange={setIsVideoLoading}
        volume={volume}
        isMuted={isMuted}
      />
    ) : (
      <HlsPlayer
        src={session.platformHlsUrl}
        title={session.title}
        volume={volume}
        isMuted={isMuted}
        qualityLevel={hlsQualityLevel}
        onQualityLevels={setHlsLevels}
        onLoadingChange={setIsVideoLoading}
      />
    );
  };

  const hasVideo = (isLive || isPaused) && !!session.platformHlsUrl;

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-black">

      {/* ── Main video area ── */}
      <div
        className="relative flex-1 min-w-0"
        onMouseMove={handleControlAreaMouseMove}
        onMouseLeave={handleControlAreaMouseLeave}
        onClick={handleVideoAreaClick}
      >
      {/* ── Video background ── */}
      {hasVideo && renderVideo()}
      {!hasVideo && <div className="absolute inset-0 bg-[#0a0b0f]" />}

      {/* ── Video loading overlay ── */}
      {hasVideo && isVideoLoading && isLive && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-black/70 px-6 py-5 backdrop-blur-xl">
            <svg
              className="h-6 w-6 animate-spin text-white/70"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            <p className="text-xs text-white/50">{t('loading')}</p>
          </div>
        </div>
      )}

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
        className="absolute inset-x-0 top-0 z-20 flex items-center gap-3"
        style={{
          paddingTop: 'max(16px, env(safe-area-inset-top, 16px))',
          paddingLeft: 'max(16px, env(safe-area-inset-left, 16px))',
          paddingRight: 'max(16px, env(safe-area-inset-right, 16px))',
        }}
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
            {socketViewerCount}
          </button>

          {/* Quality picker — always shown when live */}
          {isLive && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setQualityPickerOpen((o) => !o)}
                aria-label={t('quality.open')}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold backdrop-blur-xl transition-colors',
                  qualityPickerOpen
                    ? 'border-brand/50 bg-brand/40 text-white'
                    : 'border-white/20 bg-black/40 text-white/70 hover:bg-white/10 hover:text-white',
                )}
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                {!forceLowBandwidth && !whepFailed
                  ? t('quality.hd')
                  : hlsQualityLevel === -1
                    ? t('quality.auto')
                    : `${hlsLevels.find((l) => l.index === hlsQualityLevel)?.height ?? '?'}p`}
              </button>

              {qualityPickerOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-30 min-w-[140px] rounded-xl border border-white/15 bg-black/90 p-1 shadow-2xl backdrop-blur-2xl">
                  {/* HD / WebRTC option */}
                  <button
                    type="button"
                    onClick={() => {
                      setForceLowBandwidth(false);
                      setWhepFailed(false);
                      setWhepKey((k) => k + 1);
                      setQualityPickerOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                      !forceLowBandwidth && !whepFailed
                        ? 'bg-brand/30 text-brand'
                        : 'text-white/70 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {t('quality.hd')}
                    {!forceLowBandwidth && !whepFailed && (
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>

                  <div className="my-1 h-px bg-white/10" />

                  {/* Auto HLS — saves bandwidth */}
                  <button
                    type="button"
                    onClick={() => { setForceLowBandwidth(true); setHlsQualityLevel(-1); setQualityPickerOpen(false); }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                      (forceLowBandwidth || whepFailed) && hlsQualityLevel === -1
                        ? 'bg-brand/30 text-brand'
                        : 'text-white/70 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    <span className="flex flex-col items-start gap-0.5">
                      {t('quality.auto')}
                      <span className="text-[9px] font-normal opacity-60">{t('quality.saveData')}</span>
                    </span>
                    {(forceLowBandwidth || whepFailed) && hlsQualityLevel === -1 && (
                      <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>

                  {/* Specific HLS levels, sorted highest first */}
                  {hlsLevels.length > 0 && [...hlsLevels].sort((a, b) => b.height - a.height).map((level) => (
                    <button
                      key={level.index}
                      type="button"
                      onClick={() => { setForceLowBandwidth(true); setHlsQualityLevel(level.index); setQualityPickerOpen(false); }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                        (forceLowBandwidth || whepFailed) && hlsQualityLevel === level.index
                          ? 'bg-brand/30 text-brand'
                          : 'text-white/70 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      {level.height}p
                      {(forceLowBandwidth || whepFailed) && hlsQualityLevel === level.index && (
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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

      {/* ── Unmute CTA — pops above the combined pill when autoplay is muted ── */}
      {isLive && hasVideo && isMuted && !anyPanelOpen && !controlsVisible && (
        <button
          type="button"
          onClick={() => { setIsMuted(false); showControls(); }}
          className="absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/25 bg-black/60 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-xl transition-all hover:bg-black/80 animate-pulse"
          style={{ bottom: 'max(6rem, calc(env(safe-area-inset-bottom, 0px) + 5rem))' }}
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
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
          {t('volume.unmute')}
        </button>
      )}

      {/* ── Live interaction layer ── */}
      {isLive && (
        <>
          {/* Combined video + volume + share controls pill — centred, slides left to hide */}
          {videoState && !anyPanelOpen && (
            <ViewerVideoControls
              videoState={{ ...videoState, allowViewerControl: myVideoControlAllowed }}
              volume={volume}
              isMuted={isMuted}
              visible={controlsVisible}
              onPlay={() => sendVideoControl('play')}
              onPause={() => sendVideoControl('pause')}
              onSeek={(time) => sendVideoControl('seek', time)}
              onVolumeChange={handleVolumeChange}
              onToggleMute={toggleMute}
              onShare={() => { void handleShare(); showControls(); }}
              shareCopied={shareCopied}
            />
          )}

          {/* Standalone volume + share pill when no video is shared */}
          {!videoState && !anyPanelOpen && (
            <div
              className={cn(
                'absolute z-20 w-[min(320px,calc(100%-5rem))] sm:w-[min(360px,90vw)]',
                'left-1/2 -translate-x-1/2',
                'transition-opacity duration-300 ease-out',
                controlsVisible
                  ? 'opacity-100 pointer-events-auto'
                  : 'opacity-0 pointer-events-none',
              )}
              style={{ bottom: 'max(2rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
            >
              <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/72 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-2xl">
                {/* Mute toggle */}
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? t('volume.unmute') : t('volume.mute')}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 transition-all duration-150 hover:bg-white/10 hover:text-white active:scale-90"
                >
                  {isMuted || volume === 0 ? (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                    </svg>
                  )}
                </button>

                {/* Volume slider */}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  onPointerDown={() => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }}
                  onPointerUp={scheduleHide}
                  aria-label={t('volume.label')}
                  className="h-1 flex-1 cursor-pointer accent-white"
                />

                <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-white/40">
                  {Math.round((isMuted ? 0 : volume) * 100)}%
                </span>

                <div className="h-4 w-px shrink-0 rounded-full bg-white/15" />

                {/* Share */}
                <button
                  type="button"
                  onClick={() => { void handleShare(); showControls(); }}
                  aria-label={t('share')}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[10px] font-semibold transition-all duration-200 active:scale-95',
                    shareCopied
                      ? 'border-green-400/30 bg-green-900/40 text-green-300'
                      : 'border-white/18 bg-white/8 text-white/75 hover:border-white/30 hover:bg-white/15 hover:text-white',
                  )}
                >
                  {shareCopied ? (
                    <svg className="h-3 w-3 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  )}
                  {t('share')}
                </button>
              </div>
            </div>
          )}

          {/* Floating comments — auto-disappear via animate-float-comment */}
          {!commentsOpen && !anyPanelOpen && (
            <div
              className="absolute z-20 flex flex-col-reverse gap-1.5"
              style={{
                bottom: 'max(9rem, calc(env(safe-area-inset-bottom, 0px) + 8rem))',
                left: 'max(0.75rem, env(safe-area-inset-left, 0.75rem))',
              }}
            >
              {floatingComments.map(({ comment, key }) => (
                <CommentBubble
                  key={key}
                  comment={comment}
                  animate
                  onClick={() => {
                    if (commentsOpen) {
                      document.getElementById(`comment-${comment.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else {
                      pendingScrollIdRef.current = comment.id;
                      setCommentsOpen(true);
                      setViewersOpen(false);
                    }
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Right action rail — hover/tap to show ── */}
          {!anyPanelOpen && (
            <div
              className={cn(
                'absolute z-20 flex flex-col items-center gap-2.5 transition-opacity duration-300 ease-out',
                controlsVisible
                  ? 'opacity-100 pointer-events-auto'
                  : 'opacity-0 pointer-events-none',
              )}
              style={{
                bottom: 'max(8rem, calc(env(safe-area-inset-bottom, 0px) + 7rem))',
                right: 'max(0.75rem, env(safe-area-inset-right, 0.75rem))',
              }}
            >
              {/* Reaction floats */}
              <div className="pointer-events-none relative h-28 w-12 overflow-visible sm:h-44">
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
                  'group flex h-13 w-13 flex-col items-center justify-center gap-1 rounded-2xl border shadow-xl backdrop-blur-xl transition-all duration-200 active:scale-90',
                  localLiked
                    ? 'border-pink-400/50 bg-gradient-to-b from-pink-900/70 to-pink-950/70 text-pink-300 shadow-pink-900/30'
                    : 'border-white/15 bg-gradient-to-b from-black/50 to-black/60 text-white shadow-black/30 hover:border-white/25 hover:from-white/10 hover:to-white/5',
                )}
              >
                <svg
                  className={cn('h-[22px] w-[22px] transition-transform duration-200', localLiked && 'scale-110')}
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
                <span className={cn('text-[10px] font-bold leading-none tracking-tight', localLiked ? 'text-pink-300' : 'text-white/70')}>
                  {likeCount > 0 ? likeCount.toLocaleString() : t('like')}
                </span>
              </button>

              {/* Comment */}
              <button
                type="button"
                onClick={handleCommentToggle}
                aria-label={t('comment')}
                className={cn(
                  'relative flex h-13 w-13 flex-col items-center justify-center gap-1 rounded-2xl border shadow-xl backdrop-blur-xl transition-all duration-200 active:scale-90',
                  commentsOpen
                    ? 'border-brand/50 bg-gradient-to-b from-brand/60 to-brand/40 text-white shadow-brand/20'
                    : 'border-white/15 bg-gradient-to-b from-black/50 to-black/60 text-white shadow-black/30 hover:border-white/25 hover:from-white/10 hover:to-white/5',
                )}
              >
                <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <span className="text-[10px] font-bold leading-none tracking-tight text-white/70">
                  {comments.length > 0 ? comments.length.toLocaleString() : t('comment')}
                </span>
                {unreadCount > 0 && !commentsOpen && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold leading-none text-white shadow-md">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Viewers — only if sharer allows */}
              {session.viewersVisible && (
                <button
                  type="button"
                  onClick={handleViewersToggle}
                  aria-label={t('viewers')}
                  className={cn(
                    'flex h-13 w-13 flex-col items-center justify-center gap-1 rounded-2xl border shadow-xl backdrop-blur-xl transition-all duration-200 active:scale-90',
                    viewersOpen
                      ? 'border-blue-400/40 bg-gradient-to-b from-blue-900/60 to-blue-950/60 text-blue-300 shadow-blue-900/20'
                      : 'border-white/15 bg-gradient-to-b from-black/50 to-black/60 text-white shadow-black/30 hover:border-white/25 hover:from-white/10 hover:to-white/5',
                  )}
                >
                  <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                  </svg>
                  <span className="text-[10px] font-bold leading-none tracking-tight text-white/70">{t('viewers')}</span>
                </button>
              )}
            </div>
          )}



          {/* ── Viewers side panel ── */}
          {viewersOpen && session.viewersVisible && (
            <ViewersPanel
              sessionId={session.id}
              apiBase={apiBase}
              onClose={() => setViewersOpen(false)}
              publicViewerNames={publicViewerNames}
            />
          )}
        </>
      )}

      {/* Auth gate modal */}
      {authGateOpen && (
        <AuthGateModal
          onClose={() => setAuthGateOpen(false)}
          onSignIn={() => { setAuthGateOpen(false); setAuthLoginOpen(true); }}
        />
      )}
      {authLoginOpen && (
        <InlineAuthModal
          onClose={() => setAuthLoginOpen(false)}
          callbackUrl={pathname}
        />
      )}

      {/* Powered-by footer (non-live only) */}
      {!isLive && (
        <footer
          className="absolute inset-x-0 bottom-0 flex justify-center"
          style={{
            paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
          <p className="text-[11px] text-white/20">{t('poweredBy')}</p>
        </footer>
      )}
      </div>

      {/* Mobile backdrop — dims the video when the comment sheet is open */}
      {commentsOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm sm:hidden"
          onClick={() => setCommentsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Comment panel ──
          Mobile  : fixed bottom sheet that slides up from the bottom edge
          Desktop : flex sibling side panel that pushes the video left      ── */}
      <div
        className={cn(
          'bg-[#0a0b0f] overflow-hidden transition-all duration-500 ease-out',
          // Mobile: full-width fixed bottom sheet
          'fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-white/10',
          commentsOpen ? 'h-[82vh]' : 'h-0',
          // Desktop: side panel in the flex row
          'sm:relative sm:inset-auto sm:z-auto sm:rounded-none sm:border-t-0 sm:border-l sm:border-white/8 sm:flex-shrink-0 sm:h-full',
          commentsOpen ? 'sm:w-80' : 'sm:w-0',
        )}
      >
        <div
          className={cn(
            'absolute inset-0 flex w-full flex-col sm:w-80 transition-all duration-500 ease-out',
            commentsOpen
              ? 'opacity-100 translate-y-0 sm:translate-x-0'
              : 'opacity-0 translate-y-4 sm:translate-y-0 sm:translate-x-6',
          )}
        >
          {/* Drag handle — mobile bottom sheet only */}
          <div className="flex shrink-0 justify-center pt-3 pb-1 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-white/25" />
          </div>

          {/* Panel header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-5 py-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <svg
                className="h-4 w-4 text-white/60"
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
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-white">{t('comments')}</h3>
              {comments.length > 0 && (
                <p className="text-[10px] text-white/35">
                  {comments.length.toLocaleString()}&nbsp;messages
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCommentsOpen(false)}
              aria-label="Close comments"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/35 transition-all hover:bg-white/8 hover:text-white"
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
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/8 bg-white/4">
                  <svg
                    className="h-5 w-5 text-white/25"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                </div>
                <p className="text-xs text-white/30">{t('noComments')}</p>
              </div>
            ) : (
              <div className="py-2">
                {comments.map((c) => {
                  const cReactions = commentReactions[c.id];
                  const myReaction = myCommentReactions[c.id] ?? null;
                  const reactionEntries = cReactions
                    ? Object.entries(cReactions).filter(([, n]) => n > 0)
                    : [];
                  const isReply = !!c.replyToCommentId;
                  return (
                    <div
                      id={`comment-${c.id}`}
                      key={c.id}
                      className={cn(
                        'group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]',
                        isReply && 'pl-8',
                      )}
                    >
                      <div className="relative mt-0.5 shrink-0">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white">
                          {getInitials(c.authorName)}
                        </div>
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#0a0b0f]',
                            PLATFORM_DOT[c.platform] ?? 'bg-white/30',
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="mb-0.5 text-[11px] font-semibold text-white/50">
                          {c.authorName}
                        </p>
                        {isReply && (
                          <p className="text-[9px] text-white/35 leading-tight mb-0.5">↩ reply</p>
                        )}
                        {c.content && (
                          <p className="break-words text-xs leading-relaxed text-white/85">
                            {c.content}
                          </p>
                        )}
                        {c.mediaUrls && c.mediaUrls.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {c.mediaUrls.map((url, i) =>
                              /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url) ||
                              url.startsWith('data:image') ||
                              url.includes('giphy.com') ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={i}
                                  src={url}
                                  alt={`attachment ${i + 1}`}
                                  className="max-h-32 max-w-full rounded-lg border border-white/10 object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-brand underline"
                                >
                                  Attachment {c.mediaUrls && c.mediaUrls.length > 1 ? i + 1 : ''}
                                </a>
                              ),
                            )}
                          </div>
                        )}
                        {/* Reaction pills */}
                        {reactionEntries.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {reactionEntries.map(([emoji, count]) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleCommentReact(c.id, emoji)}
                                className={cn(
                                  'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
                                  myReaction === emoji
                                    ? 'border-brand/40 bg-brand/20 text-brand'
                                    : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80',
                                )}
                              >
                                <span>{emoji}</span>
                                <span className="tabular-nums">{count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Action buttons */}
                      <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
                        <CommentReactionPicker
                          commentId={c.id}
                          myReaction={myReaction}
                          onReact={handleCommentReact}
                        />
                        {!isReply && (
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingTo(c);
                              commentInputRef.current?.focus();
                            }}
                            className="text-[10px] text-white/30 opacity-100 transition-colors hover:text-white/70 sm:opacity-0 sm:group-hover:opacity-100"
                          >
                            {t('reply')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Input area */}
          <div
            className="shrink-0 border-t border-white/8"
            style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))' }}
          >
            {isAuthenticated ? (
              <div>
                {/* Reply context */}
                {replyingTo && (
                  <div className="flex items-center justify-between px-4 py-1.5 bg-white/5 border-b border-white/8 text-[11px] text-white/40">
                    <span>Replying to <span className="text-white/70 font-medium">{replyingTo.authorName}</span></span>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      className="text-white/30 hover:text-white/60 ml-2 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Attachment previews */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-3 pt-2">
                    {attachments.map((att, i) => {
                      const isImg =
                        att.url.startsWith('data:image') ||
                        att.url.includes('giphy.com') ||
                        /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(att.url);
                      return isImg ? (
                        <div key={i} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={att.url}
                            alt={att.name ?? 'attachment'}
                            className="h-14 w-14 rounded-lg object-cover border border-white/10"
                          />
                          <button
                            type="button"
                            onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                            className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white/70 text-[9px] hover:text-white"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div key={i} className="relative flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60">
                          <span className="truncate max-w-[80px]">{att.name ?? 'file'}</span>
                          <button
                            type="button"
                            onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                            className="text-white/30 hover:text-white/70"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Input row */}
                <div className="flex items-center gap-2 px-3 pt-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/70 text-[9px] font-bold text-white">
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
                    placeholder={replyingTo ? `Reply to ${replyingTo.authorName}…` : t('commentPlaceholder')}
                    className="flex-1 min-w-0 rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-white/30 focus:bg-white/12"
                  />
                </div>

                {/* Toolbar row */}
                <div className="flex items-center gap-0.5 px-3 py-2">
                  <EmojiPickerPopover onSelect={handleEmojiSelect} />
                  <GifPickerPopover onSelect={handleGifSelect} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 rounded-full text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
                    title="Attach file"
                    aria-label="Attach file"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,image/gif,.pdf,.doc,.docx,.txt"
                    onChange={(e) => { void handleFileChange(e); }}
                    className="hidden"
                    aria-hidden
                  />
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => void handleSendComment()}
                    disabled={!commentText.trim() && attachments.length === 0}
                    aria-label={t('send')}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-brand/40 bg-brand/70 text-white backdrop-blur-xl transition-opacity disabled:opacity-40"
                  >
                    {isSending ? (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3">
                <button
                  type="button"
                  onClick={() => setAuthLoginOpen(true)}
                  className="w-full rounded-xl border border-white/10 bg-white/6 py-3 text-sm font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {t('signInToInteract')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
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
