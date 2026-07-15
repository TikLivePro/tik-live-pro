'use client';

import { useTranslations } from 'next-intl';

interface NoAccountsEmptyStateProps {
  onConnect: () => void;
}

/** Empty state for the accounts page — shown when no social account is connected yet. */
export function NoAccountsEmptyState({ onConnect }: NoAccountsEmptyStateProps): React.ReactElement {
  const t = useTranslations('accounts.page');

  return (
    <div className="card-surface flex flex-col items-center justify-center gap-3 px-6 py-12 text-center sm:py-16">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <svg
          className="h-7 w-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
          <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
          <circle cx="12" cy="12" r="2" />
          <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
          <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
        </svg>
      </span>
      <p className="text-display text-lg font-bold">{t('emptyTitle')}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{t('emptyDescription')}</p>
      <button type="button" onClick={onConnect} className="btn-gradient mt-2 px-6 py-2.5 text-sm font-semibold">
        {t('emptyCta')}
      </button>
    </div>
  );
}
