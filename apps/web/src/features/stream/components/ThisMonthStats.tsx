'use client';

import { useTranslations } from 'next-intl';
import { useMonthlyStats } from '../hooks/useMonthlyStats';

function FilmIcon(): React.ReactElement {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <line x1="7" y1="3" x2="7" y2="21" />
      <line x1="17" y1="3" x2="17" y2="21" />
      <line x1="2" y1="9" x2="7" y2="9" />
      <line x1="2" y1="15" x2="7" y2="15" />
      <line x1="17" y1="9" x2="22" y2="9" />
      <line x1="17" y1="15" x2="22" y2="15" />
    </svg>
  );
}

function ClockIcon(): React.ReactElement {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function EyeIcon(): React.ReactElement {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function ThisMonthStats(): React.ReactElement {
  const t = useTranslations('stream');
  const { totalStreams, hoursLive, peakViewers, loading } = useMonthlyStats();

  const tiles = [
    {
      key: 'totalStreams',
      label: t('thisMonth.totalStreams'),
      value: totalStreams.toLocaleString(),
      icon: <FilmIcon />,
      iconClass: 'text-brand/50',
    },
    {
      key: 'hoursLive',
      label: t('thisMonth.hoursLive'),
      value: hoursLive.toLocaleString(),
      icon: <ClockIcon />,
      iconClass: 'text-brand-end/50',
    },
    {
      key: 'peakViewers',
      label: t('thisMonth.peakViewers'),
      value: peakViewers.toLocaleString(),
      icon: <EyeIcon />,
      iconClass: 'text-sky-400/50',
    },
  ];

  return (
    <div className="card-surface space-y-3 p-4 sm:p-5">
      <h2 className="font-semibold tracking-tight">{t('thisMonth.title')}</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {tiles.map((tile) => (
          <div key={tile.key} className="stat-tile bg-surface-1 flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm text-muted-foreground">{tile.label}</p>
              {loading ? (
                <div className="skeleton mt-1.5 h-7 w-12" />
              ) : (
                <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight">{tile.value}</p>
              )}
            </div>
            <span className={tile.iconClass}>{tile.icon}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
