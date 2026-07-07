'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text.utils';
import { getPlatformIdentityColor } from '@/lib/platform.consts';
import { EMOJI_ONLY_COMMENT_RE, QUICK_COMMENT_REACTIONS } from '../consts/stream.consts';
import type { Comment } from '@tik-live-pro/shared-types';

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  facebook: 'Facebook',
};

const isImageUrl = (url: string) =>
  url.startsWith('data:image') ||
  url.includes('giphy.com') ||
  /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url);

interface Props {
  comment: Comment;
  isReacting: boolean;
  /** Pinned variant — gradient border, pin marker, unpin action. */
  isPinned?: boolean;
  onReactOpen: () => void;
  onReactEmoji: (emoji: string) => void;
  onDelete: () => void;
  onReply: () => void;
  onPin?: () => void;
}

export function LiveCommentRow({
  comment,
  isReacting,
  isPinned = false,
  onReactOpen,
  onReactEmoji,
  onDelete,
  onReply,
  onPin,
}: Props): React.ReactElement {
  const tCommon = useTranslations('common');
  const tComments = useTranslations('comments');
  const platformColor = getPlatformIdentityColor(comment.platform);
  const platformLabel = PLATFORM_LABEL[comment.platform];
  // Emoji-only comments render as reaction rows with a subtle gradient wash.
  const isReactionRow =
    !!comment.content && EMOJI_ONLY_COMMENT_RE.test(comment.content);

  const reactBtnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useLayoutEffect(() => {
    if (!isReacting) return;
    const rect = reactBtnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top - 6, left: rect.right });
  }, [isReacting]);

  return (
    <div
      id={`comment-${comment.id}`}
      className={cn(
        'group relative flex gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-muted/50',
        isReactionRow && 'bg-gradient-to-r from-brand/10 to-brand-end/10',
        isPinned &&
          'border border-brand/30 bg-gradient-to-r from-brand/10 to-brand-end/10 hover:bg-transparent',
      )}
    >
      {/* Avatar */}
      <div className="relative mt-0.5 shrink-0 self-start">
        {comment.authorAvatarUrl ? (
          <Image
            src={comment.authorAvatarUrl}
            alt={comment.authorName}
            width={26}
            height={26}
            className="rounded-full"
          />
        ) : (
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--card-border-color)] bg-surface-1 text-[9px] font-bold text-foreground">
            {getInitials(comment.authorName)}
          </div>
        )}
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-surface-2"
          style={{ backgroundColor: platformColor ?? 'hsl(var(--muted-foreground))' }}
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold text-muted-foreground">
          {isPinned && (
            <svg className="h-3 w-3 shrink-0 text-brand" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M16 4v7l2 3v2h-5v6l-1 1-1-1v-6H6v-2l2-3V4a1 1 0 011-1h6a1 1 0 011 1z" />
            </svg>
          )}
          <span className="truncate">{comment.authorName}</span>
          {platformLabel && (
            <span
              className="shrink-0 text-[9px] font-bold uppercase tracking-wide"
              style={platformColor ? { color: platformColor } : undefined}
            >
              {platformLabel}
            </span>
          )}
        </p>
        {comment.content && (
          <p
            className={cn(
              'break-words text-xs leading-snug text-foreground',
              isReactionRow && 'text-base leading-tight',
            )}
          >
            {comment.content}
          </p>
        )}
        {(comment.mediaUrls ?? []).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {(comment.mediaUrls ?? []).map((url, i) =>
              isImageUrl(url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt={`attachment ${i + 1}`}
                  className="max-h-24 max-w-full rounded-lg object-cover"
                  loading="lazy"
                />
              ) : (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline hover:text-foreground"
                >
                  📎 file
                </a>
              ),
            )}
          </div>
        )}
      </div>

      {/* Actions — appear on hover */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {/* Emoji react */}
        <div className="relative">
          <button
            ref={reactBtnRef}
            type="button"
            onClick={onReactOpen}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-base transition-colors hover:bg-muted"
          >
            😊
          </button>

          {isReacting && mounted &&
            createPortal(
              <div
                style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translate(-100%, -100%)' }}
                className="glass-overlay z-[9999] flex gap-1 rounded-2xl p-2 shadow-2xl"
              >
                {QUICK_COMMENT_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReactEmoji(emoji)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-base transition-colors hover:bg-muted"
                  >
                    {emoji}
                  </button>
                ))}
              </div>,
              document.body,
            )}
        </div>

        {/* Pin / unpin */}
        {onPin && (
          <button
            type="button"
            onClick={onPin}
            aria-label={isPinned ? tComments('unpin') : tComments('pin')}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-lg transition-colors hover:bg-muted',
              isPinned ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 4v7l2 3v2h-5v6l-1 1-1-1v-6H6v-2l2-3V4a1 1 0 011-1h6a1 1 0 011 1z" />
            </svg>
          </button>
        )}

        {/* Reply */}
        <button
          type="button"
          onClick={onReply}
          aria-label={tComments('reply')}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 17 4 12 9 7" />
            <path d="M20 18v-2a4 4 0 00-4-4H4" />
          </svg>
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={onDelete}
          aria-label={tCommon('delete')}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/20 hover:text-red-400"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
