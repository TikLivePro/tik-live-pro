'use client';

import { useTranslations } from 'next-intl';
import { useStreamStore } from '../store/stream.store';
import { GO_LIVE_FORM_ID } from '../consts/stream.consts';

const INACTIVE_STATUSES = new Set(['ending', 'ended', 'error']);

/**
 * Mobile-only sticky bottom "Go Live" bar (per the mobile mockup).
 * Hidden while a session is active — the ActiveSessionBanner takes over.
 */
export function StickyGoLiveBar(): React.ReactElement | null {
  const t = useTranslations('stream');
  const currentSession = useStreamStore((s) => s.currentSession);

  const hasActiveSession = currentSession !== null && !INACTIVE_STATUSES.has(currentSession.status);
  if (hasActiveSession) return null;

  return (
    <div className="glass-header fixed inset-x-0 bottom-0 z-30 border-t border-border/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <button
        type="button"
        onClick={() =>
          document.getElementById(GO_LIVE_FORM_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        className="btn-gradient flex w-full items-center justify-center gap-2 py-2.5 text-sm font-bold uppercase tracking-wider"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.9 19.1a10 10 0 010-14.2M7.8 16.2a6 6 0 010-8.4M16.2 7.8a6 6 0 010 8.4M19.1 4.9a10 10 0 010 14.2" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        </svg>
        {t('goLive')}
      </button>
    </div>
  );
}
