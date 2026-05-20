'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { PLATFORM_COLORS } from '../consts/comments.consts';
import type { Comment } from '@tik-live-pro/shared-types';

interface CommentItemProps {
  comment: Comment;
}

export function CommentItem({ comment }: CommentItemProps) {
  return (
    <div
      className={cn(
        'flex gap-2 px-3 py-2 border-l-2',
        PLATFORM_COLORS[comment.platform] ?? 'border-l-muted',
      )}
    >
      {comment.authorAvatarUrl ? (
        <Image
          src={comment.authorAvatarUrl}
          alt={comment.authorName}
          width={28}
          height={28}
          className="rounded-full shrink-0 mt-0.5"
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-muted shrink-0 mt-0.5 flex items-center justify-center text-xs font-medium">
          {comment.authorName[0]?.toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <span className="text-xs font-semibold truncate">{comment.authorName}</span>
        <p className="text-sm break-words">{comment.content}</p>
      </div>
    </div>
  );
}
