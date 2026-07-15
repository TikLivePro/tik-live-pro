'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { StatSparkline } from './StatSparkline';
import {
  STATS_SAMPLE_INTERVAL_MS,
  STATS_SPARKLINE_POINTS,
} from '../consts/stream.consts';

interface Props {
  viewerCount: number;
  commentCount: number;
  reactionCount: number;
  className?: string;
}

interface StatHistory {
  viewers: number[];
  peak: number[];
  comments: number[];
  reactions: number[];
}

const compactFormat = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function pushCapped(list: readonly number[], value: number): number[] {
  return [...list, value].slice(-STATS_SPARKLINE_POINTS);
}

/**
 * Control-room stats strip — 4 compact tiles (viewers, peak, comments,
 * reactions) with trend sparklines. Samples the live values on a fixed
 * window; horizontal-scroll on mobile, 4-up grid on desktop.
 */
export function LiveStatsStrip({
  viewerCount,
  commentCount,
  reactionCount,
  className,
}: Props): React.ReactElement {
  const t = useTranslations('stream.controlRoom');

  const [peak, setPeak] = useState(viewerCount);
  useEffect(() => {
    setPeak((p) => Math.max(p, viewerCount));
  }, [viewerCount]);

  // Latest values readable from the sampling timer without re-arming it.
  const latestRef = useRef({ viewerCount, peak, commentCount, reactionCount });
  latestRef.current = { viewerCount, peak, commentCount, reactionCount };

  const [history, setHistory] = useState<StatHistory>({
    viewers: [],
    peak: [],
    comments: [],
    reactions: [],
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    function sample(): void {
      if (cancelled) return;
      const latest = latestRef.current;
      setHistory((h) => ({
        viewers: pushCapped(h.viewers, latest.viewerCount),
        peak: pushCapped(h.peak, latest.peak),
        comments: pushCapped(h.comments, latest.commentCount),
        reactions: pushCapped(h.reactions, latest.reactionCount),
      }));
      timer = setTimeout(sample, STATS_SAMPLE_INTERVAL_MS);
    }

    sample();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const tiles = [
    {
      key: 'viewers',
      label: t('viewers'),
      value: viewerCount,
      points: history.viewers,
      iconBg: 'bg-brand/10 text-brand',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
    {
      key: 'peak',
      label: t('peakViewers'),
      value: peak,
      points: history.peak,
      iconBg: 'bg-orange-500/10 text-orange-500',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      ),
    },
    {
      key: 'comments',
      label: t('commentsCount'),
      value: commentCount,
      points: history.comments,
      iconBg: 'bg-emerald-500/10 text-emerald-500',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
        </svg>
      ),
    },
    {
      key: 'reactions',
      label: t('reactions'),
      value: reactionCount,
      points: history.reactions,
      iconBg: 'bg-pink-500/10 text-pink-500',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className={cn(
        'flex snap-x gap-3 overflow-x-auto pb-1',
        '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        'lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0',
        className,
      )}
    >
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className="stat-tile min-w-[11rem] flex-1 snap-start p-3 sm:p-4 lg:min-w-0"
        >
          <div className="flex items-center gap-3">
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tile.iconBg)}>
              {tile.icon}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {tile.label}
              </p>
              <p className="text-lg font-bold tabular-nums text-foreground sm:text-xl">
                {compactFormat.format(tile.value)}
              </p>
            </div>
          </div>
          <StatSparkline points={tile.points} className="mt-2" />
        </div>
      ))}
    </div>
  );
}
