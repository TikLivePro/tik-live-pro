'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { PublicSession } from './WatchView';

interface Props {
  viewerCount: number;
  elapsedLabel: string | null;
  status: PublicSession['status'];
  className?: string;
}

/** Compact stat tiles under the watch-page player: viewers, uptime, platform sync. */
export function WatchStatTiles({ viewerCount, elapsedLabel, status, className }: Props): React.ReactElement {
  const t = useTranslations('watch.stats');

  const sync =
    status === 'live'
      ? { label: t('syncStable'), tone: 'text-emerald-400', dot: 'bg-emerald-400' }
      : status === 'paused'
        ? { label: t('syncPaused'), tone: 'text-amber-400', dot: 'bg-amber-400' }
        : { label: t('syncOffline'), tone: 'text-muted-foreground', dot: 'bg-muted-foreground/50' };

  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      <div className="stat-tile px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('viewers')}
        </p>
        <p className="mt-1 text-lg font-bold tabular-nums text-foreground sm:text-xl">
          {viewerCount.toLocaleString()}
        </p>
      </div>
      <div className="stat-tile px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('uptime')}
        </p>
        <p className="mt-1 text-lg font-bold tabular-nums text-foreground sm:text-xl">
          {elapsedLabel ?? '—'}
        </p>
      </div>
      <div className="stat-tile px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('platformSync')}
        </p>
        <p className={cn('mt-1 flex items-center gap-1.5 text-lg font-bold sm:text-xl', sync.tone)}>
          <span className={cn('h-2 w-2 rounded-full', sync.dot)} />
          {sync.label}
        </p>
      </div>
    </div>
  );
}
