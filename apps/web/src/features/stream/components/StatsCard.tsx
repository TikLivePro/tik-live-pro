'use client';

import { useTranslations } from 'next-intl';

interface StatsCardProps {
  elapsed: string;
  liveCount: number;
  totalCount: number;
}

export function StatsCard({ elapsed, liveCount, totalCount }: StatsCardProps) {
  const t = useTranslations('stream');

  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/5 px-5 py-4 sm:px-6 sm:py-5">
      <div>
        <p className="text-xs text-slate-400">{t('liveDuration')}</p>
        <p className="mt-1 font-mono text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">
          {elapsed}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-slate-400">{t('liveAccounts')}</p>
        <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-green-400 sm:text-4xl">
          {liveCount}&nbsp;/&nbsp;{totalCount}
        </p>
      </div>
    </div>
  );
}
