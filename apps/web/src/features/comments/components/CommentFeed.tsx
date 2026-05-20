'use client';

import { useTranslations } from 'next-intl';
import { useStreamStore } from '@/features/stream/store/stream.store';
import { useComments } from '../hooks/useComments';
import { CommentItem } from './CommentItem';

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
