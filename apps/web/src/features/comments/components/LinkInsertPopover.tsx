'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface LinkInsertPopoverProps {
  onInsert: (url: string) => void;
  disabled?: boolean | undefined;
}

export function LinkInsertPopover({ onInsert, disabled }: LinkInsertPopoverProps) {
  const t = useTranslations('comments');
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 50);
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleInsert = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    onInsert(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    setUrl('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        title="Insert link"
        aria-label="Insert link"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 bg-card text-card-foreground [backdrop-filter:none] border border-border/60 rounded-xl shadow-2xl p-3 w-64">
          <p className="text-xs font-medium text-muted-foreground mb-2">{t('insertLink')}</p>
          <input
            ref={inputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleInsert(); }
              if (e.key === 'Escape') { setOpen(false); }
            }}
            placeholder="https://example.com"
            className="w-full text-sm bg-muted border border-border rounded-lg px-3 py-1.5 mb-2.5 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
          <div className="flex gap-2">
            <button
              onClick={handleInsert}
              disabled={!url.trim()}
              className="flex-1 text-sm font-medium py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('insertLinkConfirm')}
            </button>
            <button
              onClick={() => { setOpen(false); setUrl(''); }}
              className="text-sm px-3 py-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('cancelReply')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
