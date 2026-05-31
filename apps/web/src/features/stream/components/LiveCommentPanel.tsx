'use client';

import { useRef, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useStreamStore } from '../store/stream.store';
import { LiveCommentRow } from './LiveCommentRow';
import type { Comment } from '@tik-live-pro/shared-types';

interface Props {
  sendComment: (content: string) => Promise<void>;
  replyToComment: (commentId: string, content: string) => Promise<void>;
  isSending: boolean;
  onClose: () => void;
}

export function LiveCommentPanel({ sendComment, replyToComment, isSending, onClose }: Props): React.ReactElement {
  const t = useTranslations('comments');
  const { comments, removeComment, addReaction } = useStreamStore();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reactingId) return;
    function onMouseDown() { setReactingId(null); }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [reactingId]);

  async function handleSend(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    if (replyTo) {
      await replyToComment(replyTo.id, trimmed);
      setReplyTo(null);
    } else {
      await sendComment(trimmed);
    }
    setText('');
  }

  function handleReply(comment: Comment): void {
    setReplyTo(comment);
    setText('');
    inputRef.current?.focus();
  }

  function handleReactEmoji(emoji: string): void {
    addReaction({ id: crypto.randomUUID(), emoji, left: Math.floor(Math.random() * 36) });
    setReactingId(null);
  }

  function toggleReacting(commentId: string): void {
    setReactingId((prev) => (prev === commentId ? null : commentId));
  }

  return (
    <div className="absolute left-0 top-14 bottom-24 z-40 flex w-full flex-col border-r border-white/20 bg-black/55 backdrop-blur-2xl sm:w-80">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          <span className="text-sm font-semibold text-white">{t('title')}</span>
          {comments.length > 0 && (
            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
              {comments.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Comment list */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-1">
        {comments.length === 0 ? (
          <p className="mt-10 text-center text-xs text-white/25">{t('noComments')}</p>
        ) : (
          comments.map((comment) => (
            <LiveCommentRow
              key={comment.id}
              comment={comment}
              isReacting={reactingId === comment.id}
              onReactOpen={() => toggleReacting(comment.id)}
              onReactEmoji={handleReactEmoji}
              onDelete={() => removeComment(comment.id)}
              onReply={() => handleReply(comment)}
            />
          ))
        )}
      </div>

      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 border-t border-white/20 bg-white/[0.06] px-4 py-2">
          <span className="flex-1 truncate text-xs text-white/50">
            {t('replyingTo', { name: replyTo.authorName })}
          </span>
          <button
            type="button"
            onClick={() => { setReplyTo(null); setText(''); }}
            aria-label={t('cancelReply')}
            className="text-white/30 transition-colors hover:text-white/70"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="border-t border-white/20 px-3 py-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
            }}
            placeholder={replyTo ? t('replyPlaceholder', { name: replyTo.authorName }) : t('inputPlaceholder')}
            className="flex-1 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/35 outline-none backdrop-blur-sm transition-colors focus:border-white/40 focus:bg-white/15"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!text.trim() || isSending}
            aria-label={t('send')}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-brand/40 bg-brand/70 text-white backdrop-blur-xl transition-opacity disabled:opacity-40"
          >
            {isSending ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
