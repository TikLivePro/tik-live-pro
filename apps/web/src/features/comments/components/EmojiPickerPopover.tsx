'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import data from '@emoji-mart/data';

/* eslint-disable @typescript-eslint/no-explicit-any */
const EmojiMart = dynamic(
  () =>
    import('@emoji-mart/react').then((m) => {
      const Comp: React.ComponentType<any> = (m as any).default ?? m;
      return { default: Comp };
    }),
  { ssr: false },
) as React.ComponentType<{
  data: unknown;
  onEmojiSelect: (emoji: { native: string }) => void;
  theme?: string;
  previewPosition?: string;
  skinTonePosition?: string;
  perLine?: number;
  emojiSize?: number;
}>;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface EmojiPickerPopoverProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean | undefined;
}

export function EmojiPickerPopover({ onSelect, disabled }: EmojiPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-full hover:bg-muted transition-colors text-lg leading-none disabled:opacity-40 disabled:cursor-not-allowed"
        title="Insert emoji"
        aria-label="Insert emoji"
      >
        😀
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 bg-card [backdrop-filter:none] border border-border/60 shadow-2xl rounded-xl overflow-hidden">
          <EmojiMart
            data={data}
            onEmojiSelect={(emoji) => {
              onSelect(emoji.native);
              setOpen(false);
            }}
            theme="auto"
            previewPosition="none"
            skinTonePosition="none"
            perLine={8}
            emojiSize={22}
          />
        </div>
      )}
    </div>
  );
}
