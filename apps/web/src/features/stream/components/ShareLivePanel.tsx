'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { LiveSessionId } from '@tik-live-pro/shared-types';

interface Props {
  sessionId: LiveSessionId;
  className?: string;
}

export function ShareLivePanel({ sessionId, className }: Props): React.ReactElement {
  const t = useTranslations('stream');
  const [watchUrl, setWatchUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setWatchUrl(`${window.location.origin}/watch/${sessionId}`);
  }, [sessionId]);

  async function handleShare() {
    if (!watchUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: t('share.title'), url: watchUrl });
      } else {
        await navigator.clipboard.writeText(watchUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // user cancelled or clipboard denied — no-op
    }
  }

  async function handleCopy() {
    if (!watchUrl) return;
    try {
      await navigator.clipboard.writeText(watchUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard denied — no-op
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {t('share.sectionLabel')}
      </p>
      <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3">
        <svg
          className="h-3.5 w-3.5 flex-shrink-0 text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </svg>
        <span className="flex-1 truncate font-mono text-xs text-slate-300">
          {watchUrl || '…'}
        </span>

        <button
          type="button"
          onClick={() => void handleCopy()}
          title={t('share.copy')}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          {copied ? (
            <svg className="h-3.5 w-3.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={() => void handleShare()}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 transition-colors"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          {copied ? t('share.copied') : t('share.button')}
        </button>
      </div>
    </div>
  );
}
