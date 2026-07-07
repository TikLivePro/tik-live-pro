'use client';

import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { GO_LIVE_FORM_ID } from '../consts/stream.consts';

function scrollToGoLiveForm(): void {
  document.getElementById(GO_LIVE_FORM_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function DashboardGreeting(): React.ReactElement {
  const t = useTranslations('stream');
  const displayName = useAuthStore((s) => s.displayName);
  const firstName = displayName?.split(' ')[0] ?? '';

  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="animate-fade-up text-display text-2xl font-bold tracking-tight sm:text-3xl">
        {firstName ? t('greeting', { name: firstName }) : t('greetingGeneric')}
      </h1>
      <button
        type="button"
        onClick={scrollToGoLiveForm}
        className="btn-gradient hidden shrink-0 items-center gap-2 px-5 py-2 text-xs font-bold uppercase tracking-wider sm:flex"
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
