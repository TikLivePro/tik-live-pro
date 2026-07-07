'use client';

import { useTranslations } from 'next-intl';
import type { LiveSession } from '@tik-live-pro/shared-types';

export function ShareEmailButton({ session }: { session: LiveSession }): React.ReactElement {
  const t = useTranslations('stream');
  const watchUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/watch/${session.id}`;
  const mailto = `mailto:?subject=${encodeURIComponent('Check out my live stream')}&body=${encodeURIComponent(`Watch my recording: ${watchUrl}`)}`;

  return (
    <a
      href={mailto}
      className="btn-ghost flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
      {t('history.shareEmail')}
    </a>
  );
}
