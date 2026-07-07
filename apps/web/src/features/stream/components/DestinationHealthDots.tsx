'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { DestinationIcon } from './DestinationIcon';
import type { PlatformStreamDestination } from '@tik-live-pro/shared-types';

const STATUS_DOT: Record<string, string> = {
  live: 'bg-emerald-400',
  connecting: 'bg-amber-400',
  pending: 'bg-amber-400/70',
  error: 'bg-red-500',
  ended: 'bg-muted-foreground/40',
};

const STATUS_LABEL_KEY: Record<string, string> = {
  live: 'healthStreaming',
  connecting: 'healthConnecting',
  pending: 'healthPending',
  error: 'healthError',
  ended: 'healthEnded',
};

interface Props {
  destinations: readonly PlatformStreamDestination[];
  className?: string;
}

/** Per-destination health dots for the live status bar (green Streaming / amber Reconnecting). */
export function DestinationHealthDots({ destinations, className }: Props): React.ReactElement | null {
  const t = useTranslations('stream.controlRoom');

  if (destinations.length === 0) return null;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {destinations.map((dest) => {
        const label = t(
          (STATUS_LABEL_KEY[dest.status] ?? 'healthPending') as Parameters<typeof t>[0],
        );
        return (
          <span
            key={dest.socialAccountId}
            title={`${dest.platform} — ${label}`}
            className="chip-platform gap-1.5 py-1 pl-1 pr-2 text-[11px] font-medium text-muted-foreground"
          >
            <DestinationIcon platform={dest.platform} />
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                STATUS_DOT[dest.status] ?? 'bg-muted-foreground/40',
                dest.status === 'live' && 'animate-pulse motion-reduce:animate-none',
              )}
            />
            <span className="hidden xl:inline">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
