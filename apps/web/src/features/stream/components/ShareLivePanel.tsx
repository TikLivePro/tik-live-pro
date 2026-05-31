'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useSocialAccounts } from '@/features/accounts/hooks/useSocialAccounts';
import type { LiveSessionId, SocialPlatform } from '@tik-live-pro/shared-types';

interface Props {
  sessionId: LiveSessionId;
  className?: string;
}

const FACEBOOK_SHARE_URL = (url: string) =>
  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

function PlatformIcon({ platform }: { platform: SocialPlatform }): React.ReactElement {
  if (platform === 'tiktok') {
    return (
      <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function ShareLivePanel({ sessionId, className }: Props): React.ReactElement {
  const t = useTranslations('stream');
  const [watchUrl, setWatchUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: accounts } = useSocialAccounts();

  useEffect(() => {
    setWatchUrl(`${window.location.origin}/watch/${sessionId}`);
  }, [sessionId]);

  useEffect(() => {
    if (!popupOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopupOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [popupOpen]);

  async function handleCopy() {
    if (!watchUrl) return;
    try {
      await navigator.clipboard.writeText(watchUrl);
      setCopied(true);
      setPopupOpen(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard denied — no-op
    }
  }

  function handleShareToAccount(platform: SocialPlatform) {
    if (!watchUrl) return;
    if (platform === 'facebook') {
      window.open(FACEBOOK_SHARE_URL(watchUrl), '_blank', 'noopener,noreferrer,width=600,height=500');
    } else {
      // TikTok has no standard web share dialog — use native share or copy
      if (navigator.share) {
        void navigator.share({ title: t('share.title'), url: watchUrl });
      } else {
        void navigator.clipboard.writeText(watchUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    }
    setPopupOpen(false);
  }

  return (
    <div className={cn('space-y-2', className)}>
      <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {t('share.sectionLabel')}
      </p>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/5 px-4 py-3">
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

        {/* Share via email */}
        <a
          href={`mailto:?subject=${encodeURIComponent(t('share.title'))}&body=${encodeURIComponent(watchUrl)}`}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
          title={t('history.shareEmail')}
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </a>

        {/* Share popup */}
        <div className="relative" ref={containerRef}>
          <button
            type="button"
            onClick={() => setPopupOpen((o) => !o)}
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

          {popupOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-56 overflow-hidden rounded-xl bg-[#1c1f2e] shadow-xl ring-1 ring-white/10 z-50">
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {t('share.popup.heading')}
              </p>

              {accounts && accounts.length > 0 ? (
                <div>
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => handleShareToAccount(account.platform)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
                    >
                      <PlatformIcon platform={account.platform} />
                      <span className="truncate text-left">{account.displayName}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-4 pb-3 text-xs text-slate-400">{t('share.popup.noAccounts')}</p>
              )}

              <div className="border-t border-white/5">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
                >
                  <svg className="h-4 w-4 flex-shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  {t('share.copy')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
