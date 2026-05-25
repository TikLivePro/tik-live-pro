'use client';

import { useTranslations } from 'next-intl';
import { useStreamStore } from '@/features/stream/store/stream.store';
import { useComments } from '../hooks/useComments';
import { CommentItem } from './CommentItem';
import { CommentInput } from './CommentInput';
import type { Comment } from '@tik-live-pro/shared-types';

export function CommentFeed() {
  const t = useTranslations('comments');
  const { currentSession, comments } = useStreamStore();
  const { replyingTo, setReplyingTo, sendComment, replyToComment, isSending } =
    useComments(currentSession?.id ?? null);

  const handleReply = (comment: Comment) => {
    setReplyingTo(comment);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleSend = async (text: string, mediaUrls?: string[]) => {
    if (!text && !mediaUrls?.length) return;
    if (replyingTo) {
      await replyToComment(replyingTo.id, text, mediaUrls);
    } else {
      await sendComment(text, mediaUrls);
    }
  };

  const placeholder = replyingTo
    ? t('replyPlaceholder', { name: replyingTo.authorName })
    : t('inputPlaceholder');

  return (
    <div className="rounded-xl border border-border bg-background shadow-sm h-[600px] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h2 className="font-semibold">{t('title')}</h2>
        <p className="text-xs text-muted-foreground">{comments.length} {t('commentsCount')}</p>
      </div>

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {comments.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">{t('noComments')}</p>
        ) : (
          comments.map((c) => (
            <CommentItem key={c.id} comment={c} onReply={handleReply} />
          ))
        )}
      </div>

      {/* Reply context bar */}
      {replyingTo && (
        <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-muted/50 border-t border-border text-xs text-muted-foreground">
          <span>{t('replyingTo', { name: replyingTo.authorName })}</span>
          <button
            onClick={handleCancelReply}
            className="text-xs hover:text-foreground ml-2 transition-colors"
          >
            {t('cancelReply')}
          </button>
        </div>
      )}

      {/* Rich input */}
      <div className="shrink-0 p-3 border-t border-border">
        <CommentInput
          placeholder={placeholder}
          isSending={isSending}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}
