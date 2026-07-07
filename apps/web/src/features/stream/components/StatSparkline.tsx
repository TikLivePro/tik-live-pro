'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Sampled history, oldest first. */
  points: readonly number[];
  className?: string;
}

const VIEW_W = 100;
const VIEW_H = 32;
const PAD_Y = 4;

/**
 * Tiny single-series sparkline for stat tiles.
 * Line is drawn in the muted de-emphasis ink; the current (last) point
 * carries the brand accent, per the stat-tile trend spec.
 */
export const StatSparkline = memo(function StatSparkline({
  points,
  className,
}: Props): React.ReactElement {
  const n = points.length;
  const min = n > 0 ? Math.min(...points) : 0;
  const max = n > 0 ? Math.max(...points) : 0;
  const span = max - min;

  const toXY = (value: number, i: number): [number, number] => {
    const x = n > 1 ? (i / (n - 1)) * VIEW_W : VIEW_W;
    const y =
      span > 0 ? VIEW_H - PAD_Y - ((value - min) / span) * (VIEW_H - PAD_Y * 2) : VIEW_H / 2;
    return [x, y];
  };

  const coords = points.map((v, i) => toXY(v, i));
  const path = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn('h-7 w-full text-muted-foreground/50', className)}
    >
      {n > 1 ? (
        <polyline
          points={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <line
          x1="0"
          y1={VIEW_H / 2}
          x2={VIEW_W}
          y2={VIEW_H / 2}
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="2 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {last && (
        <circle
          cx={last[0]}
          cy={last[1]}
          r="3"
          fill="hsl(var(--brand))"
          stroke="var(--surface-2)"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
});
