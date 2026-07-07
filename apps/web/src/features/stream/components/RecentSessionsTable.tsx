'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useSessionHistory } from '../hooks/useSessionHistory';
import { useViewerPeaks } from '../hooks/useViewerPeaks';
import { formatSessionDate, formatSessionDuration } from '../consts/session-format.utils';
import { StatusBadge } from './StatusBadge';
import { SessionThumbnail } from './SessionThumbnail';
import { DestinationIcon } from './DestinationIcon';
import { ReplayLink } from './ReplayLink';

const MAX_ROWS = 5;

interface Props {
  onViewAll: () => void;
}

export function RecentSessionsTable({ onViewAll }: Props): React.ReactElement {
  const t = useTranslations('stream');
  const { sessions, loading } = useSessionHistory();
  const rows = sessions.slice(0, MAX_ROWS);
  const peaks = useViewerPeaks(useMemo(() => rows.map((s) => s.id), [rows]));

  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/80 px-5 py-4">
        <h2 className="font-semibold tracking-tight">{t('recentSessions.title')}</h2>
        {sessions.length > MAX_ROWS && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-brand hover:underline"
          >
            {t('recentSessions.viewAll')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2 p-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </span>
          <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <table className="hidden w-full text-left sm:table">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2.5 font-semibold">{t('recentSessions.streamCol')}</th>
                <th className="px-5 py-2.5 font-semibold">{t('recentSessions.dateCol')}</th>
                <th className="px-5 py-2.5 font-semibold">{t('recentSessions.destinationsCol')}</th>
                <th className="px-5 py-2.5 font-semibold">{t('recentSessions.viewersCol')}</th>
                <th className="px-5 py-2.5 text-right font-semibold">{t('recentSessions.actionCol')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <SessionThumbnail />
                      <div className="min-w-0">
                        <p className="max-w-xs truncate text-sm font-semibold">{s.title}</p>
                        <div className="mt-1">
                          <StatusBadge status={s.status} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-muted-foreground">
                    {formatSessionDate(s.createdAt)}
                    <span className="block opacity-70">{formatSessionDuration(s.startedAt, s.endedAt)}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5">
                      {s.destinations.map((d) => (
                        <DestinationIcon key={d.socialAccountId} platform={d.platform} />
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-sm tabular-nums">
                    {peaks[s.id] !== undefined ? (
                      <>
                        {peaks[s.id]!.toLocaleString()}
                        <span className="ml-1.5 align-middle text-[9px] font-bold uppercase tracking-wider text-brand-end/80">
                          {t('recentSessions.peakLabel')}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ReplayLink sessionId={s.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile stacked cards */}
          <ul className="divide-y divide-border/70 sm:hidden">
            {rows.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <SessionThumbnail />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatSessionDate(s.createdAt)} · {formatSessionDuration(s.startedAt, s.endedAt)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {s.destinations.map((d) => (
                      <DestinationIcon key={d.socialAccountId} platform={d.platform} />
                    ))}
                    <StatusBadge status={s.status} />
                    {peaks[s.id] !== undefined && (
                      <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        {peaks[s.id]!.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <ReplayLink sessionId={s.id} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
