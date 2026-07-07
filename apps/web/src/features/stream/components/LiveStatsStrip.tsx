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
    { key: 'viewers', label: t('viewers'), value: viewerCount, points: history.viewers },
    { key: 'peak', label: t('peakViewers'), value: peak, points: history.peak },
    { key: 'comments', label: t('commentsCount'), value: commentCount, points: history.comments },
    { key: 'reactions', label: t('reactions'), value: reactionCount, points: history.reactions },
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
          className="stat-tile min-w-[9.5rem] flex-1 snap-start p-3 sm:p-4 lg:min-w-0"
        >
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {tile.label}
          </p>
          <p className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">
            {compactFormat.format(tile.value)}
          </p>
          <StatSparkline points={tile.points} className="mt-2" />
        </div>
      ))}
    </div>
  );
}
