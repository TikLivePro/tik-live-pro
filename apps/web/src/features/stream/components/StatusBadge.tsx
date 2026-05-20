'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const t = useTranslations('stream.status');
  const isLive = status === 'live';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full',
        isLive
          ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {isLive && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
      {t(status as Parameters<typeof t>[0])}
    </span>
  );
}
