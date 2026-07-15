'use client';

import { useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useSessionHistory } from '../hooks/useSessionHistory';
import { useViewerPeaks } from '../hooks/useViewerPeaks';
import { formatSessionDate, formatSessionDuration } from '../consts/session-format.utils';
import { StatusBadge } from './StatusBadge';
import { SessionThumbnail } from './SessionThumbnail';
import { DestinationIcon } from './DestinationIcon';
import { ReplayLink } from './ReplayLink';
import { ShareEmailButton } from './ShareEmailButton';
import { VideoTileSkeleton } from '@/components/skeletons/VideoTileSkeleton';

interface Props {
  hideHeader?: boolean;
  open?: boolean;
}

export function SessionHistory({ hideHeader = false, open }: Props): React.ReactElement {
  const t = useTranslations('stream');
  const { sessions, loading, refresh } = useSessionHistory();
  const peaks = useViewerPeaks(useMemo(() => sessions.map((s) => s.id), [sessions]));

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (loading) {
    return (
      <section className="space-y-2">
        {!hideHeader && (
          <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t('history.sectionLabel')}
          </p>
        )}
        <ul className="space-y-2">
          {[1, 2, 3].map((i) => (
            <li key={i} className="card-surface px-4 py-3">
              <VideoTileSkeleton />
            </li>
          ))}
        </ul>
      </section>
    );
  }

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
          <li key={s.id} className="card-surface space-y-2.5 px-4 py-3">
            <div className="flex items-center gap-3">
              <SessionThumbnail />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatSessionDate(s.createdAt)} · {formatSessionDuration(s.startedAt, s.endedAt)}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
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
              <div className="flex items-center gap-2.5">
                <ReplayLink sessionId={s.id} />
                <ShareEmailButton session={s} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
