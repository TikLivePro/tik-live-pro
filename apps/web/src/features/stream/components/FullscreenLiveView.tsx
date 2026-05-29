'use client';

import { useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useStream } from '../hooks/useStream';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { useCameraStream } from '../hooks/useCameraStream';
import { useStreamStore } from '../store/stream.store';
import { useComments } from '@/features/comments/hooks/useComments';
import { LiveCommentFloat } from './LiveCommentFloat';
import { LiveReactionFloat } from './LiveReactionFloat';

const REACTION_EMOJIS = ['❤️', '🔥', '😍', '👏', '💯', '🎉'];

export function FullscreenLiveView(): React.ReactElement {
  const t = useTranslations('stream');
  const { currentSession, isEnding, endSession } = useStream();
  const { comments, liveReactions, addReaction, removeReaction } = useStreamStore();
  const { videoRef, isMicMuted, isCameraOff, toggleMic, toggleCamera } = useCameraStream(true);

  // Keep WebSocket open for live comments and reactions
  useComments(currentSession?.id ?? null);

  const isLive = currentSession?.status === 'live';
  const elapsed = useElapsedTime(isLive ? (currentSession?.startedAt ?? null) : null);
  const destinations = currentSession?.destinations ?? [];
  const liveCount = destinations.filter((d) => d.status === 'live').length;

  const mountedAtRef = useRef(Date.now());

  const fireReaction = useCallback(() => {
    const emoji = REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)] ?? '❤️';
    addReaction({ id: crypto.randomUUID(), emoji, left: Math.floor(Math.random() * 36) });
  }, [addReaction]);

  const overlayComments = comments.slice(0, 5);

  function isNewComment(comment: { receivedAt: Date | string }): boolean {
    const ms =
      comment.receivedAt instanceof Date
        ? comment.receivedAt.getTime()
        : new Date(comment.receivedAt as string).getTime();
    return ms > mountedAtRef.current - 500;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black">
      {/* Background video */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cn('absolute inset-0 h-full w-full object-cover', isCameraOff && 'opacity-0')}
      />

      {isCameraOff && <div className="absolute inset-0 bg-[#0f1117]" />}

      {/* ── Top overlay ── */}
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/65 to-transparent pb-14 px-4 pt-4">
        <div className="flex items-center justify-between">
          {/* Left: LIVE badge + elapsed time */}
          <div className="flex items-center gap-2.5">
            {isLive && (
              <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold tracking-wide text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                LIVE
              </span>
            )}
            <span className="rounded-full bg-black/35 px-2.5 py-1 text-xs font-semibold text-white tabular-nums backdrop-blur-sm">
              {elapsed}
            </span>
          </div>

          {/* Right: account count + end button */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm">
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

            <button
              onClick={() => currentSession && void endSession(currentSession.id)}
              disabled={isEnding}
              className="flex items-center gap-1.5 rounded-full border border-white/35 bg-black/35 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="h-2 w-2 rounded-[2px] border border-current" />
              {isEnding ? t('status.ending') : t('stopLive')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Right side: action buttons + floating reactions ── */}
      <div className="absolute bottom-28 right-3 flex flex-col items-center gap-3">
        {/* Reactions float upward from inside this container */}
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

        {/* Like / react button */}
        <button
          type="button"
          onClick={fireReaction}
          aria-label={t('camera.mute')}
          className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-full border border-white/35 bg-black/35 text-white backdrop-blur-sm transition-transform active:scale-90"
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

        {/* Share button */}
        <button
          type="button"
          aria-label="Share"
          className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-full border border-white/35 bg-black/35 text-white backdrop-blur-sm"
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
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span className="text-[9px] font-semibold leading-none">Share</span>
        </button>
      </div>

      {/* ── Comment overlay — bottom left ── */}
      <div className="absolute bottom-28 left-3 flex flex-col-reverse gap-1.5">
        {overlayComments.map((c) => (
          <LiveCommentFloat key={c.id} comment={c} animate={isNewComment(c)} />
        ))}
      </div>

      {/* ── Bottom controls bar ── */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent pb-6 pt-16 px-6">
        <div className="flex items-center justify-center gap-4">
          {/* Mic toggle */}
          <button
            type="button"
            onClick={toggleMic}
            aria-label={isMicMuted ? t('camera.unmute') : t('camera.mute')}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-sm transition-colors',
              isMicMuted
                ? 'border-red-500/80 bg-red-600/75 text-white'
                : 'border-white/35 bg-black/35 text-white hover:bg-white/10',
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
              'flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-sm transition-colors',
              isCameraOff
                ? 'border-red-500/80 bg-red-600/75 text-white'
                : 'border-white/35 bg-black/35 text-white hover:bg-white/10',
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

          {/* End stream */}
          <button
            type="button"
            onClick={() => currentSession && void endSession(currentSession.id)}
            disabled={isEnding}
            className="flex items-center gap-2 rounded-full border border-white/35 bg-black/35 px-7 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="h-3.5 w-3.5 flex-shrink-0 rounded-[3px] border-2 border-current" />
            {isEnding ? t('status.ending') : t('stopLive')}
          </button>
        </div>
      </div>
    </div>
  );
}
