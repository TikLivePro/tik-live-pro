'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { UpgradeModal } from '@/features/settings';
import { FREE_PLAN_MAX_ACCOUNTS } from '../consts/accounts.consts';

/**
 * Freemium locked account slot — shown to free-tier users once every slot is
 * taken. Display only: the authoritative limit check lives in the billing service.
 */
export function LockedAccountSlot(): React.ReactElement {
  const t = useTranslations('accounts.page');
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-muted/20 p-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </span>
      <p className="text-sm font-bold">{t('lockedTitle')}</p>
      <p className="max-w-56 text-xs text-muted-foreground">
        {t('lockedDescription', { max: FREE_PLAN_MAX_ACCOUNTS })}
      </p>
      <button
        type="button"
        onClick={() => setUpgradeOpen(true)}
        className="text-gradient-brand mt-1 text-sm font-bold transition-opacity hover:opacity-80"
      >
        {t('lockedUpgrade')}
        <span aria-hidden="true">&nbsp;→</span>
      </button>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
