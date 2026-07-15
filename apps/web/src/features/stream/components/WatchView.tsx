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
import { ReplayTimeline } from '@/features/comments/components/ReplayTimeline';
import { PLATFORM_IDENTITY_COLORS, getPlatformIdentityColor } from '@/lib/platform.consts';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { LiveReactionFloat } from './LiveReactionFloat';
import { ViewersPanel } from './ViewersPanel';
import { ViewerVideoControls } from './ViewerVideoControls';
import { WatchTopBar } from './WatchTopBar';
import { WatchStatTiles } from './WatchStatTiles';
import { WatchQuickReactions } from './WatchQuickReactions';
import type { ViewerVideoState } from './ViewerVideoControls';
import type { Comment } from '@tik-live-pro/shared-types';

const WEBRTC_BASE =
  process.env.NEXT_PUBLIC_MEDIAMTX_WEBRTC_URL ?? 'http://localhost:8889';
// Adaptive polling: fast while stream is starting/transitioning, slow once stable.
// 100 viewers × 4 polls/min (live) = 400 req/min vs 1200 req/min with a fixed 5s interval.
const POLL_INTERVAL_STARTING_MS = 3000;
const POLL_INTERVAL_LIVE_MS = 15000;
const POLL_INTERVAL_MAX_MS = 30000;
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
      // MediaMTX serves 2s segments / 500ms parts (anti-stutter tuning); a sync
      // target below one segment duration makes hls.js chase a live edge the
      // playlist can't sustain, causing periodic stall/seek loops. Hold about
      // two segments back from the edge instead.
      liveSyncDuration: 4,
      liveMaxLatencyDuration: 12,
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
    // Recover from fatal errors instead of leaving the viewer on a black
    // screen — the host's ffmpeg relay restarting (routine during transient
    // platform hiccups) surfaces here as playlist 404s / media errors.
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        setTimeout(() => {
          if (hlsRef.current === hls) hls.startLoad();
        }, 2000);
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      }
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

// ── Chat row platform dots ────────────────────────────────────

const PLATFORM_DOT: Record<string, string> = {
  tiktok: 'bg-[#ff0050]',
  facebook: 'bg-[#1877f2]',
};

// ── Auth gate modal ───────────────────────────────────────────

function AuthGateModal({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }): React.ReactElement {
  const t = useTranslations('watch');
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 pb-16 backdrop-blur-sm sm:items-center sm:pb-0"
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
  const { isAuthenticated, displayName, email } = useAuthStore();

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
  const [viewersOpen, setViewersOpen] = useState(false);
  const [authGateOpen, setAuthGateOpen] = useState(false);
  const [authLoginOpen, setAuthLoginOpen] = useState(false);

  // Interactions
  const [isFollowing, setIsFollowing] = useState(false);
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
  const socketRef = useRef<Socket | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const [videoState, setVideoState] = useState<ViewerVideoState | null>(null);

  // Volume and controls visibility
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Track the last-seen status locally: comparing against the closure's
    // session.status (frozen at effect mount) made every poll after a single
    // transition look like a change, so the backoff never engaged and early
    // viewers polled at the fast interval for the whole pre-live phase.
    let lastStatus = session.status;

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`${apiBase}/sessions/${session.id}/public`);
        if (res.ok) {
          const { data } = (await res.json()) as { data: PublicSession };
          const statusChanged = data.status !== lastStatus;
          if (statusChanged) {
            lastStatus = data.status;
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
  // accessToken is intentionally excluded from deps: we don't want to reconnect on
  // every token refresh and lose events. The auth callback below reads the token
  // fresh from the store at each (re)connect handshake instead.
  useEffect(() => {
    if (!isLive) return;

    // auth is a callback so every (re)connect handshake carries a fresh access
    // token — a static object would replay a token that expires after 15 min.
    const socket = socketIo(COMMENTS_WS_URL, {
      auth: (cb) => {
        const token = useAuthStore.getState().accessToken;
        cb(token ? { token } : {});
      },
      query: { sessionId: session.id },
      transports: ['websocket'],
      reconnectionAttempts: 8,
      // Jitter spreads reconnect attempts across 3–9s so 100 viewers don't all
      // hammer the server at the same instant after a restart.
      reconnectionDelay: 3000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
    });

    // Announce as viewer so the streamer can see us in the audience list.
    // Emitted on 'connect' (not once at creation) so the viewer re-registers
    // after every reconnect — the server's viewer registry is in-memory and
    // forgets us when the comments service restarts or the socket drops.
    socket.on('connect', () => {
      socket.emit('join_as_viewer', { displayName: viewerDisplayName });
    });

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

  // Quick reaction — one socket emit per tap; server-side per-socket +
  // per-session rate limits stay authoritative.
  const handleQuickReaction = useCallback((emoji: string) => {
    if (!isAuthenticated) {
      setAuthGateOpen(true);
      return;
    }
    // Show local animation immediately; broadcast to all other viewers via socket
    setLiveReactions((prev) =>
      [
        ...prev,
        { id: crypto.randomUUID(), emoji, left: Math.floor(Math.random() * 36) },
      ].slice(-MAX_REACTIONS),
    );
    socketRef.current?.emit('emit_reaction', { emoji });
  }, [isAuthenticated]);

  // Follow is client-local until a follow API exists — the gradient CTA
  // matches the mockup and gates unauthenticated viewers to sign-in.
  const handleFollow = useCallback(() => {
    if (!isAuthenticated) {
      setAuthGateOpen(true);
      return;
    }
    setIsFollowing((f) => !f);
  }, [isAuthenticated]);

  const handleFullscreen = useCallback(() => {
    const el = playerContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  }, []);

  const handleViewersToggle = useCallback(() => {
    setViewersOpen((prev) => !prev);
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

  // Keep controls visible while the viewers panel is open
  useEffect(() => {
    if (viewersOpen) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setControlsVisible(true);
    }
  }, [viewersOpen]);

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
    // Attachments travel as base64 data: URLs stored in Postgres and fanned
    // out to every viewer — the API rejects items over 200KB (≈145KB binary).
    const MAX_ATTACHMENT_BYTES = 140 * 1024;
    const MAX_ATTACHMENTS = 4;
    const files = Array.from(e.target.files ?? []).filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    if (files.length === 0) { e.target.value = ''; return; }
    const loaded = await Promise.all(files.map(readFileAsDataUrl));
    setAttachments((prev) => [...prev, ...loaded].slice(0, MAX_ATTACHMENTS));
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
          // POST /comments returns an array (one per platform); /reply a single object
          const body = (await res.json()) as { data: Comment | Comment[] };
          const created = Array.isArray(body?.data) ? body.data : [body?.data];
          setComments((prev) => {
            const fresh = created.filter((c) => c?.id && !prev.some((p) => p.id === c.id));
            if (fresh.length === 0) return prev;
            return [...fresh, ...prev].slice(0, 100);
          });
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

  // Auto-scroll chat to the newest message (list renders oldest → newest)
  useEffect(() => {
    const el = commentListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length]);


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
    <div className="dark flex min-h-svh flex-col bg-surface-0 text-foreground lg:h-svh">
      <WatchTopBar />

      <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        {/* ── Main column: player + stream info ── */}
        <section className="flex flex-col gap-4 p-4 sm:p-6 lg:min-w-0 lg:flex-1 lg:overflow-y-auto">
          {/* ── Player shell — sticky on mobile so the video stays visible while chat scrolls ── */}
          <div
            ref={playerContainerRef}
            className="sticky top-14 z-30 -mx-4 shrink-0 overflow-hidden bg-black shadow-2xl shadow-black/50 sm:-mx-6 lg:static lg:mx-0 lg:rounded-card lg:border lg:border-[var(--card-border-color)]"
            onMouseMove={handleControlAreaMouseMove}
            onMouseLeave={handleControlAreaMouseLeave}
            onClick={handleVideoAreaClick}
          >
            <div className="relative aspect-video">
              {hasVideo && renderVideo()}
              {!hasVideo && <div className="absolute inset-0 bg-black" />}

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

              {/* Legibility gradients behind the overlays */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 to-transparent" />

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

              {/* ── Top-left overlay: LIVE pill + viewer chip ── */}
              <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
                {isLive && (
                  <span className="badge-live px-2.5 py-1 text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
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
                    'flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-xs font-semibold text-white/80 backdrop-blur-xl transition-colors',
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
                  {socketViewerCount.toLocaleString()}
                </button>
              </div>

              {/* ── Top-right overlay: quality picker ── */}
              {isLive && (
                <div className="absolute right-3 top-3 z-20">
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

              {/* ── Non-live centered state inside the dimmed player ── */}
              {!isLive && !isPaused && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/60 px-6 text-center backdrop-blur-sm">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/35">
                    {isStarting ? (
                      <svg
                        className="h-6 w-6 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                      </svg>
                    ) : (
                      <svg
                        className="h-7 w-7"
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
                  <div className="space-y-1">
                    <p className="text-base font-bold text-white sm:text-lg">
                      {isEnded ? t('endedTitle') : session.title}
                    </p>
                    <p className="text-sm text-white/50">
                      {isEnded ? t('endedDesc') : t('startingDesc')}
                    </p>
                  </div>
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

              {/* ── Unmute CTA — autoplay starts muted ── */}
              {isLive && hasVideo && isMuted && !controlsVisible && (
                <button
                  type="button"
                  onClick={() => { setIsMuted(false); showControls(); }}
                  className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/25 bg-black/60 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-xl transition-all hover:bg-black/80 animate-pulse"
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

              {/* ── Floating emoji reactions rising over the video (fan-out caps kept) ── */}
              <div className="pointer-events-none absolute bottom-4 right-4 z-20 h-32 w-12 overflow-visible sm:h-44">
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

              {/* ── Live controls ── */}
              {isLive && (
                <>
                  {/* Shared-video controls pill (play/seek/volume/share) — only when a video source is shared */}
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

                  {/* Camera-stream bottom control bar: mute, volume, elapsed, share */}
                  {!videoState && !anyPanelOpen && (
                    <div
                      className={cn(
                        'absolute inset-x-3 bottom-3 z-20 flex items-center gap-3 rounded-2xl border border-white/15 bg-black/72 px-4 py-2.5 shadow-2xl shadow-black/50 backdrop-blur-2xl transition-opacity duration-300 ease-out',
                        controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
                      )}
                    >
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
                        className="h-1 w-24 cursor-pointer accent-white sm:w-32"
                      />

                      <span className="shrink-0 text-[11px] tabular-nums text-white/40">
                        {Math.round((isMuted ? 0 : volume) * 100)}%
                      </span>

                      <div className="flex-1" />

                      <span className="hidden shrink-0 text-[11px] font-semibold tabular-nums text-white/60 sm:inline">
                        {elapsed}
                      </span>

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

                      <button
                        type="button"
                        onClick={handleFullscreen}
                        aria-label={t('fullscreen')}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
                        </svg>
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── Viewers side panel (overlay within the player) ── */}
              {isLive && viewersOpen && session.viewersVisible && (
                <ViewersPanel
                  sessionId={session.id}
                  apiBase={apiBase}
                  onClose={() => setViewersOpen(false)}
                  publicViewerNames={publicViewerNames}
                />
              )}
            </div>
          </div>

          {/* ── Title + destination chips ── */}
          <div className="flex shrink-0 flex-col gap-2.5">
            <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {session.title}
            </h1>
            {session.platforms.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {session.platforms.includes('tiktok') && (
                  <span
                    className="chip-platform px-2.5 py-1 text-xs font-semibold"
                    style={{ color: PLATFORM_IDENTITY_COLORS.tiktok }}
                  >
                    <TikTokIcon />
                    TikTok
                  </span>
                )}
                {session.platforms.includes('facebook') && (
                  <span
                    className="chip-platform px-2.5 py-1 text-xs font-semibold"
                    style={{ color: PLATFORM_IDENTITY_COLORS.facebook }}
                  >
                    <FacebookIcon />
                    Facebook
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Creator row ── */}
          <div className="card-surface flex shrink-0 items-center gap-3 px-4 py-3">
            <div className="bg-gradient-brand shrink-0 rounded-full p-px">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-foreground">
                {getInitials(session.title)}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{t('creator.host')}</p>
              <p className="text-xs text-muted-foreground">
                {t('creator.watching', { count: socketViewerCount })}
              </p>
            </div>
            <button
              type="button"
              onClick={handleFollow}
              className={cn(
                isFollowing
                  ? 'btn-ghost px-4 py-1.5 text-sm font-semibold'
                  : 'btn-gradient px-4 py-1.5 text-sm font-semibold',
              )}
            >
              {isFollowing ? t('creator.following') : t('creator.follow')}
            </button>
          </div>

          {/* ── Stat tiles ── */}
          <WatchStatTiles
            viewerCount={socketViewerCount}
            elapsedLabel={isLive ? elapsed : null}
            status={session.status}
            className="shrink-0"
          />

          {/* ── Ended: chat replay timeline ── */}
          {isEnded && <ReplayTimeline sessionId={session.id} />}

          <p className="mt-auto pt-2 text-center text-[11px] text-muted-foreground/60">
            {t('poweredBy')}
          </p>
        </section>

        {/* ── Chat rail ── */}
        <aside className="flex min-h-[55vh] flex-1 flex-col border-t border-[var(--card-border-color)] bg-surface-1 lg:min-h-0 lg:w-[380px] lg:flex-none lg:border-l lg:border-t-0">
          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-[var(--card-border-color)] px-5 py-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--card-border-color)] bg-surface-2">
              <svg
                className="h-4 w-4 text-muted-foreground"
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
              <h2 className="text-sm font-semibold text-foreground">{t('liveChat')}</h2>
              {comments.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {t('messagesCount', { count: comments.length })}
                </p>
              )}
            </div>
          </div>

          {/* Message list — oldest → newest, composer at the bottom (chat convention) */}
          <div ref={commentListRef} className="flex-1 overflow-y-auto">
            {comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--card-border-color)] bg-surface-2">
                  <svg
                    className="h-5 w-5 text-muted-foreground/50"
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
                <p className="text-xs text-muted-foreground">{t('noComments')}</p>
              </div>
            ) : (
              <div className="py-2">
                {[...comments].reverse().map((c) => {
                  const cReactions = commentReactions[c.id];
                  const myReaction = myCommentReactions[c.id] ?? null;
                  const reactionEntries = cReactions
                    ? Object.entries(cReactions).filter(([, n]) => n > 0)
                    : [];
                  const isReply = !!c.replyToCommentId;
                  const identityColor = getPlatformIdentityColor(c.platform);
                  return (
                    <div
                      id={`comment-${c.id}`}
                      key={c.id}
                      className={cn(
                        'group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40',
                        isReply && 'pl-8',
                      )}
                    >
                      <div className="relative mt-0.5 shrink-0">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-[9px] font-bold text-foreground">
                          {getInitials(c.authorName)}
                        </div>
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-surface-1',
                            PLATFORM_DOT[c.platform] ?? 'bg-muted-foreground/40',
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                          <span className="truncate">{c.authorName}</span>
                          {identityColor && (
                            <span
                              className="shrink-0 text-[9px] font-bold uppercase tracking-wide"
                              style={{ color: identityColor }}
                            >
                              {c.platform === 'tiktok' ? 'TikTok' : 'Facebook'}
                            </span>
                          )}
                        </p>
                        {isReply && (
                          <p className="text-[9px] text-muted-foreground/70 leading-tight mb-0.5">↩ {t('reply')}</p>
                        )}
                        {c.content && (
                          <p className="break-words text-xs leading-relaxed text-foreground/90">
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
                                  className="max-h-32 max-w-full rounded-lg border border-[var(--card-border-color)] object-cover"
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
                                    : 'border-[var(--card-border-color)] bg-surface-2 text-muted-foreground hover:bg-muted hover:text-foreground',
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
                            className="text-[10px] text-muted-foreground/70 opacity-100 transition-colors hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
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

          {/* Quick-reaction bar — server-side rate limits stay authoritative */}
          {isLive && (
            <div className="shrink-0 border-t border-[var(--card-border-color)]">
              <WatchQuickReactions onReact={handleQuickReaction} />
            </div>
          )}

          {/* Composer — hidden once the stream has ended (replay timeline covers history) */}
          {!isEnded && (
          <div
            className="shrink-0 border-t border-[var(--card-border-color)]"
            style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))' }}
          >
            {isAuthenticated ? (
              <div>
                {/* Reply context */}
                {replyingTo && (
                  <div className="flex items-center justify-between border-b border-[var(--card-border-color)] bg-surface-2 px-4 py-1.5 text-[11px] text-muted-foreground">
                    <span>
                      {t('replyingTo')}{' '}
                      <span className="font-medium text-foreground">{replyingTo.authorName}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      className="ml-2 text-muted-foreground/70 transition-colors hover:text-foreground"
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
                            className="h-14 w-14 rounded-lg border border-[var(--card-border-color)] object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                            className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-[9px] text-white/70 hover:text-white"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div key={i} className="relative flex items-center gap-1 rounded-lg border border-[var(--card-border-color)] bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground">
                          <span className="max-w-[80px] truncate">{att.name ?? 'file'}</span>
                          <button
                            type="button"
                            onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                            className="text-muted-foreground/60 hover:text-foreground"
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
                    placeholder={replyingTo ? t('replyPlaceholder', { name: replyingTo.authorName }) : t('commentPlaceholder')}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--input-border-color)] bg-surface-2 px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 outline-none transition-colors focus:border-brand/60"
                  />
                </div>

                {/* Toolbar row */}
                <div className="flex items-center gap-0.5 px-3 py-2">
                  <EmojiPickerPopover onSelect={handleEmojiSelect} />
                  <GifPickerPopover onSelect={handleGifSelect} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={t('attachFile')}
                    aria-label={t('attachFile')}
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
                    className="btn-gradient flex h-8 items-center gap-1.5 px-3.5 text-xs font-semibold disabled:opacity-40"
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
                    {t('send')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3">
                <button
                  type="button"
                  onClick={() => setAuthLoginOpen(true)}
                  className="btn-gradient w-full py-3 text-sm font-semibold"
                >
                  {t('logInToChat')}
                </button>
              </div>
            )}
          </div>
          )}
        </aside>
      </div>

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
