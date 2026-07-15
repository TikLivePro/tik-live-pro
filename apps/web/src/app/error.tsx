'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  const t = useTranslations('errorPage');

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface-0 px-6 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 30%, hsl(var(--destructive) / 0.08) 0%, transparent 70%)',
        }}
      />

      <div className="glass-overlay relative z-10 flex w-full max-w-md flex-col items-start gap-4 rounded-card p-8 text-left">
        <div className="flex items-center gap-2 text-destructive">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-widest">{t('label')}</span>
        </div>

        <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('message')}</p>

        <details className="group w-full">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted/50">
            {t('technicalDetails')}
            <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-180" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </summary>
          <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
            <code className="block whitespace-pre-wrap break-words text-[11px] leading-relaxed text-destructive/80">
              {t('errorCode')}: {error.message || 'unknown'}
              {error.digest ? `\ndigest: ${error.digest}` : ''}
            </code>
          </div>
        </details>

        <div className="mt-2 flex w-full gap-2">
          <button
            type="button"
            onClick={reset}
            className="flex-1 rounded-lg border border-border py-2.5 text-sm font-semibold transition-colors hover:bg-muted active:scale-[0.98]"
          >
            {t('retry')}
          </button>
          <Link
            href="/"
            className="flex-1 rounded-lg border border-border py-2.5 text-center text-sm font-semibold transition-colors hover:bg-muted active:scale-[0.98]"
          >
            {t('goHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
