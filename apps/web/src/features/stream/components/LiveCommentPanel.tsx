'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getPlatformIdentityColor } from '@/lib/platform.consts';
import { useStreamStore } from '../store/stream.store';
import { LiveCommentRow } from './LiveCommentRow';
import { CommentInput } from '@/features/comments/components/CommentInput';
import type { Comment } from '@tik-live-pro/shared-types';

type CommentFilter = 'all' | 'tiktok' | 'facebook';

const PLATFORM_FILTERS: readonly { id: CommentFilter; label: string | null }[] = [
  { id: 'all', label: null }, // label comes from i18n (comments.filterAll)
  { id: 'tiktok', label: 'TikTok' },
  { id: 'facebook', label: 'Facebook' },
];

/** Scroll distance from the bottom above which auto-scroll pauses. */
const AUTOSCROLL_PAUSE_THRESHOLD_PX = 64;

interface Props {
  sendComment: (content: string, mediaUrls?: string[]) => Promise<void>;
  replyToComment: (commentId: string, content: string, mediaUrls?: string[]) => Promise<void>;
  emitReaction: (emoji: string) => void;
  isSending: boolean;
}

export function LiveCommentPanel({
  sendComment,
  replyToComment,
  emitReaction,
  isSending,
}: Props): React.ReactElement {
  const t = useTranslations('comments');
  const { comments, removeComment, addReaction } = useStreamStore();
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CommentFilter>('all');
  const [pinned, setPinned] = useState<Comment | null>(null);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reactingId) return;
    function onMouseDown() { setReactingId(null); }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [reactingId]);

  // Store keeps newest-first; the panel renders oldest-first so new messages
  // arrive at the bottom, next to the composer (chat convention).
  const visible = comments
    .filter((c) => (filter === 'all' ? true : c.platform === filter))
    .filter((c) => c.id !== pinned?.id)
    .slice()
    .reverse();

  // Pin the list to the bottom on new messages unless the user scrolled away.
  useEffect(() => {
    if (autoScrollPaused) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [comments, filter, pinned, autoScrollPaused]);

  function handleListScroll(): void {
    setReactingId(null);
    const el = listRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScrollPaused(distFromBottom > AUTOSCROLL_PAUSE_THRESHOLD_PX);
  }

  function jumpToLatest(): void {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setAutoScrollPaused(false);
  }

  function toggleAutoScroll(): void {
    if (autoScrollPaused) jumpToLatest();
    else setAutoScrollPaused(true);
  }

  async function handleSend(text: string, mediaUrls?: string[]): Promise<void> {
    if (!text.trim() && !mediaUrls?.length) return;
    if (replyTo) {
      await replyToComment(replyTo.id, text.trim(), mediaUrls);
      setReplyTo(null);
    } else {
      await sendComment(text.trim(), mediaUrls);
    }
  }

  function handleReactEmoji(emoji: string): void {
    addReaction({ id: crypto.randomUUID(), emoji, left: Math.floor(Math.random() * 36) });
    emitReaction(emoji);
    setReactingId(null);
  }

  function toggleReacting(commentId: string): void {
    setReactingId((prev) => (prev === commentId ? null : commentId));
  }

  const placeholder = replyTo
    ? t('replyPlaceholder', { name: replyTo.authorName })
    : t('inputPlaceholder');

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Toolbar: platform filter chips + autoscroll toggle */}
      <div className="flex items-center gap-1.5 border-b border-[var(--card-border-color)] px-3 py-2.5">
        {PLATFORM_FILTERS.map(({ id, label }) => {
          const isActive = filter === id;
          const color = id === 'all' ? undefined : getPlatformIdentityColor(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={isActive}
              className={cn(
                'chip-platform px-3 py-1 text-[11px] font-semibold transition-colors',
                isActive
                  ? 'border-transparent bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {color && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
              )}
              {label ?? t('filterAll')}
            </button>
          );
        })}

        <button
          type="button"
          onClick={toggleAutoScroll}
          aria-pressed={autoScrollPaused}
          aria-label={autoScrollPaused ? t('resumeAutoscroll') : t('pauseAutoscroll')}
          title={autoScrollPaused ? t('resumeAutoscroll') : t('pauseAutoscroll')}
          className={cn(
            'ml-auto flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-muted',
            autoScrollPaused ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {autoScrollPaused ? (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="19 12 12 19 5 12" />
              <line x1="12" y1="5" x2="12" y2="19" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          )}
        </button>
      </div>

      {/* Pinned comment */}
      {pinned && (
        <div className="border-b border-[var(--card-border-color)] px-2 py-1.5">
          <LiveCommentRow
            comment={pinned}
            isPinned
            isReacting={reactingId === pinned.id}
            onReactOpen={() => toggleReacting(pinned.id)}
            onReactEmoji={handleReactEmoji}
            onDelete={() => {
              removeComment(pinned.id);
              setPinned(null);
            }}
            onReply={() => setReplyTo(pinned)}
            onPin={() => setPinned(null)}
          />
        </div>
      )}

      {/* Comment list — oldest first, pinned to the bottom */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-1 py-1"
        onScroll={handleListScroll}
      >
        {visible.length === 0 ? (
          <p className="mt-10 text-center text-xs text-muted-foreground/60">{t('noComments')}</p>
        ) : (
          visible.map((comment) => (
            <LiveCommentRow
              key={comment.id}
              comment={comment}
              isReacting={reactingId === comment.id}
              onReactOpen={() => toggleReacting(comment.id)}
              onReactEmoji={handleReactEmoji}
              onDelete={() => removeComment(comment.id)}
              onReply={() => setReplyTo(comment)}
              onPin={() => setPinned(comment)}
            />
          ))
        )}
      </div>

      {/* Jump-to-latest pill while auto-scroll is paused */}
      {autoScrollPaused && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
          <button
            type="button"
            onClick={jumpToLatest}
            className="btn-gradient pointer-events-auto flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="19 12 12 19 5 12" />
              <line x1="12" y1="5" x2="12" y2="19" />
            </svg>
            {t('newMessages')}
          </button>
        </div>
      )}

      {/* Reply context bar */}
      {replyTo && (
        <div className="flex items-center gap-2 border-t border-[var(--card-border-color)] bg-muted/40 px-4 py-2">
          <span className="flex-1 truncate text-xs text-muted-foreground">
            {t('replyingTo', { name: replyTo.authorName })}
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label={t('cancelReply')}
            className="text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Reply composer */}
      <div className="border-t border-[var(--card-border-color)] p-3">
        <CommentInput
          placeholder={placeholder}
          isSending={isSending}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}
