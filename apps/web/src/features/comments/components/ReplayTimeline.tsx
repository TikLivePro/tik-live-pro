'use client';

import { useTranslations } from 'next-intl';
import { useSessionReplay } from '../hooks/useSessionReplay';
import { ReplayCommentRow } from './ReplayCommentRow';
import { ReplayReactionRow } from './ReplayReactionRow';
import { CommentRowSkeleton } from '@/components/skeletons/CommentRowSkeleton';

interface Props {
  sessionId: string;
}

/**
 * Chronological history of everything viewers sent during an ended live —
 * every comment and emoji reaction, each with its exact send time.
 * Rendered on the watch page once the session has ended.
 */
export function ReplayTimeline({ sessionId }: Props): React.ReactElement | null {
  const t = useTranslations('watch.replay');
  const { items, commentCount, reactionCount, loading, error } = useSessionReplay(sessionId, true);

  if (error) return null;

  return (
    <section
      aria-label={t('title')}
      className="flex max-h-[60vh] min-h-0 w-full max-w-xl flex-col rounded-2xl border border-white/10 bg-black/40 text-left backdrop-blur-md"
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-bold text-white">{t('title')}</h3>
        {!loading && (
          <span className="text-[11px] text-white/50">
            {t('summary', { comments: commentCount, reactions: reactionCount })}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="space-y-3 px-1 py-1">
            {[1, 2, 3, 4].map((i) => (
              <CommentRowSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-white/40">{t('empty')}</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item) =>
              item.type === 'comment' ? (
                <ReplayCommentRow key={item.comment.id} comment={item.comment} />
              ) : (
                <ReplayReactionRow key={item.id} emoji={item.emoji} count={item.count} sentAt={item.sentAt} />
              ),
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
