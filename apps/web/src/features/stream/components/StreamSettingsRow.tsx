'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}

/** Collapsible "Stream settings" row — resolution, source and stream links live inside. */
export function StreamSettingsRow({ open, onToggle, children, className }: Props): React.ReactElement {
  const t = useTranslations('stream.controlRoom');
  const contentId = useId();

  return (
    <section className={cn('card-surface overflow-hidden', className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 sm:px-5"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-1 text-muted-foreground">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{t('settings')}</span>
          <span className="block truncate text-xs text-muted-foreground">{t('settingsHint')}</span>
        </span>
        <svg
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          id={contentId}
          className="border-t border-[var(--card-border-color)] p-4 sm:p-5"
        >
          {children}
        </div>
      )}
    </section>
  );
}
