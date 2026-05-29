'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text.utils';
import type { Comment } from '@tik-live-pro/shared-types';

const PLATFORM_DOT: Record<string, string> = {
  tiktok: 'bg-[#ff0050]',
  facebook: 'bg-[#1877f2]',
};

interface Props {
  comment: Comment;
  animate?: boolean;
}

export function LiveCommentFloat({ comment, animate = true }: Props): React.ReactElement {
  const dot = PLATFORM_DOT[comment.platform] ?? 'bg-white/40';

  return (
    <div
      className={cn(
        'flex max-w-[260px] items-start gap-2 rounded-2xl bg-black/55 px-3 py-2 backdrop-blur-sm',
        animate && 'animate-slide-comment',
      )}
    >
      <div className="relative mt-0.5 shrink-0">
        {comment.authorAvatarUrl ? (
          <Image
            src={comment.authorAvatarUrl}
            alt={comment.authorName}
            width={22}
            height={22}
            className="rounded-full"
          />
        ) : (
          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white/20 text-[9px] font-bold text-white">
            {getInitials(comment.authorName)}
          </div>
        )}
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-black/50',
            dot,
          )}
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-white/80">{comment.authorName}</p>
        {comment.content && (
          <p className="line-clamp-2 break-words text-xs leading-snug text-white">
            {comment.content}
          </p>
        )}
      </div>
    </div>
  );
}
