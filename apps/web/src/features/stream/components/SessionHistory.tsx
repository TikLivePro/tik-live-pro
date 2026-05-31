'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSessionHistory } from '../hooks/useSessionHistory';
import type { LiveSession } from '@tik-live-pro/shared-types';

function formatDuration(startedAt: Date | string | null | undefined, endedAt: Date | string | null | undefined): string {
  if (!startedAt || !endedAt) return '—';
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(iso: Date | string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ShareEmailButton({ session }: { session: LiveSession }): React.ReactElement {
  const t = useTranslations('stream');
  const watchUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/watch/${session.id}`;
  const mailto = `mailto:?subject=${encodeURIComponent('Check out my live stream')}&body=${encodeURIComponent(`Watch my recording: ${watchUrl}`)}`;

  return (
    <a
      href={mailto}
      className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
      {t('history.shareEmail')}
    </a>
  );
}

interface Props {
  hideHeader?: boolean;
  open?: boolean;
}

export function SessionHistory({ hideHeader = false, open }: Props): React.ReactElement {
  const t = useTranslations('stream');
  const { sessions, loading, refresh } = useSessionHistory();

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (loading) return <></>;

  if (sessions.length === 0) {
    return (
      <section className="space-y-2">
        {!hideHeader && (
          <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t('history.sectionLabel')}
          </p>
        )}
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          {t('history.empty')}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      {!hideHeader && (
        <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t('history.sectionLabel')}
        </p>
      )}
      <ul className="space-y-2">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{s.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(s.createdAt)} · {formatDuration(s.startedAt, s.endedAt)}
                {' · '}{s.destinations.length} {s.destinations.length === 1 ? 'platform' : 'platforms'}
              </p>
            </div>
            <ShareEmailButton session={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}
