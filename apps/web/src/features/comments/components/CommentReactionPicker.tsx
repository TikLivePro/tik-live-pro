'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

interface CommentReactionPickerProps {
  commentId: string;
  myReaction: string | null;
  onReact: (commentId: string, emoji: string) => void;
}

export function CommentReactionPicker({ commentId, myReaction, onReact }: CommentReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Element;
      if (btnRef.current?.contains(target as Node)) return;
      if (target.closest('[data-reaction-portal]')) return;
      setOpen(false);
    };
    const closeOnScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnScroll);
    };
  }, [open]);

  const handleOpen = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.top - 52,
        left: rect.left + rect.width / 2,
      });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className={cn(
          'shrink-0 leading-none p-1 rounded-full transition-all',
          myReaction
            ? 'text-base opacity-100'
            : 'text-sm text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
          'hover:bg-muted',
        )}
        aria-label="Add reaction"
        title="Add reaction"
      >
        {myReaction ?? '🙂'}
      </button>
      {mounted && open &&
        createPortal(
          <div
            data-reaction-portal
            style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
            className="z-[9999] flex items-center gap-0.5 px-2 py-1.5 bg-popover border border-border shadow-xl rounded-full"
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onReact(commentId, emoji); setOpen(false); }}
                className={cn(
                  'text-xl leading-none w-9 h-9 flex items-center justify-center rounded-full hover:scale-125 transition-transform hover:bg-muted active:scale-110',
                  myReaction === emoji && 'bg-muted scale-110',
                )}
                aria-label={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
