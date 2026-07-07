'use client';

import { useTranslations } from 'next-intl';
import { useStreamStore } from '@/features/stream/store/stream.store';
import { useComments } from '../hooks/useComments';
import { CommentItem } from './CommentItem';
import { CommentInput } from './CommentInput';
import type { Comment } from '@tik-live-pro/shared-types';

export function CommentFeed() {
  const t = useTranslations('comments');
  const {
    currentSession,
    comments,
    commentReactions,
    myCommentReactions,
    addCommentReaction,
  } = useStreamStore();
  const { replyingTo, setReplyingTo, sendComment, replyToComment, isSending, sendError } =
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
    <div className="card-surface flex h-[480px] flex-col overflow-hidden sm:h-[600px]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/80 bg-muted/30 px-4 py-3">
        <h2 className="font-semibold tracking-tight">{t('title')}</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
          </svg>
          {comments.length} {t('commentsCount')}
        </span>
      </div>

      {/* Comment list */}
      <div className="flex-1 divide-y divide-border/70 overflow-y-auto">
        {comments.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
              </svg>
            </span>
            <p className="text-sm text-muted-foreground">{t('noComments')}</p>
          </div>
        ) : (
          comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              reactions={commentReactions[c.id]}
              myReaction={myCommentReactions[c.id] ?? null}
              onReply={handleReply}
              onReact={addCommentReaction}
            />
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

      {/* Send failure notice */}
      {sendError && (
        <div className="shrink-0 px-3 py-1.5 bg-destructive/10 border-t border-destructive/20 text-xs text-destructive" role="alert">
          {t('sendError')}
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
