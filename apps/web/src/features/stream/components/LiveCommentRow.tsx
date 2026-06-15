'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text.utils';
import type { Comment } from '@tik-live-pro/shared-types';

const PLATFORM_DOT: Record<string, string> = {
  tiktok: 'bg-[#ff0050]',
  facebook: 'bg-[#1877f2]',
};

const QUICK_REACTIONS = ['❤️', '🔥', '😂', '👏', '😮', '💯'];

const isImageUrl = (url: string) =>
  url.startsWith('data:image') ||
  url.includes('giphy.com') ||
  /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url);

interface Props {
  comment: Comment;
  isReacting: boolean;
  onReactOpen: () => void;
  onReactEmoji: (emoji: string) => void;
  onDelete: () => void;
  onReply: () => void;
}

export function LiveCommentRow({
  comment,
  isReacting,
  onReactOpen,
  onReactEmoji,
  onDelete,
  onReply,
}: Props): React.ReactElement {
  const tCommon = useTranslations('common');
  const tComments = useTranslations('comments');
  const dot = PLATFORM_DOT[comment.platform] ?? 'bg-white/30';

  return (
    <div id={`comment-${comment.id}`} className="group relative flex gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-white/10">
      {/* Avatar */}
      <div className="relative mt-0.5 shrink-0">
        {comment.authorAvatarUrl ? (
          <Image
            src={comment.authorAvatarUrl}
            alt={comment.authorName}
            width={26}
            height={26}
            className="rounded-full"
          />
        ) : (
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-white/20 bg-black/40 text-[9px] font-bold text-white">
            {getInitials(comment.authorName)}
          </div>
        )}
        <span className={cn('absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-black/40', dot)} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-white/60">{comment.authorName}</p>
        {comment.content && (
          <p className="break-words text-xs leading-snug text-white">{comment.content}</p>
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
                  className="inline-flex items-center gap-1 text-[11px] text-white/70 underline hover:text-white"
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
            type="button"
            onClick={onReactOpen}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-base transition-colors hover:bg-white/10"
          >
            😊
          </button>

          {isReacting && (
            <div className="absolute bottom-full right-0 mb-1.5 flex gap-1 rounded-2xl border border-white/25 bg-black/60 p-2 shadow-2xl shadow-black/40 backdrop-blur-2xl z-50">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReactEmoji(emoji)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-base transition-colors hover:bg-white/10"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reply */}
        <button
          type="button"
          onClick={onReply}
          aria-label={tComments('reply')}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
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
          className="flex h-6 w-6 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-red-500/20 hover:text-red-400"
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
