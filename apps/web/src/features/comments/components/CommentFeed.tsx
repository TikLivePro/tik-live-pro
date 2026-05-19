'use client';

import { useTranslations } from 'next-intl';
import { useStreamStore } from '@/store/stream.store';
import { useComments } from '@/hooks/useComments';
import type { Comment } from '@tik-live-pro/shared-types';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: 'border-l-[#ff0050]',
  facebook: 'border-l-[#1877f2]',
};

export function CommentFeed() {
  const t = useTranslations('comments');
  const { currentSession, comments } = useStreamStore();

  useComments(currentSession?.id ?? null);

  return (
    <div className="rounded-xl border border-border bg-background shadow-sm h-[600px] flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-semibold">{t('title')}</h2>
        <p className="text-xs text-muted-foreground">{comments.length} comments</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-0 divide-y divide-border">
        {comments.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">{t('noComments')}</p>
        ) : (
          comments.map((c) => <CommentItem key={c.id} comment={c} />)
        )}
      </div>
    </div>
  );
}

function CommentItem({ comment }: { comment: Comment }) {
  return (
    <div className={cn('flex gap-2 px-3 py-2 border-l-2', PLATFORM_COLORS[comment.platform] ?? 'border-l-muted')}>
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
