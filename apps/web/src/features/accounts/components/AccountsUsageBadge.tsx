'use client';

import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useSocialAccounts } from '../hooks/useSocialAccounts';
import { FREE_PLAN_MAX_ACCOUNTS } from '../consts/accounts.consts';

/**
 * Header pill for the accounts page: "n of 2 accounts used" + free-plan chip.
 * Free tier only — paid tiers have no display-side account limit.
 */
export function AccountsUsageBadge(): React.ReactElement | null {
  const t = useTranslations('accounts.page');
  const { data: accounts, isLoading } = useSocialAccounts();
  const { subscriptionTier } = useAuthStore();

  const isFree = (subscriptionTier ?? 'free') === 'free';
  if (!isFree || isLoading) return null;

  const count = accounts?.length ?? 0;
  const limitReached = count >= FREE_PLAN_MAX_ACCOUNTS;

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${limitReached ? 'bg-amber-500' : 'bg-green-500'}`}
        aria-hidden="true"
      />
      <span className="text-xs font-semibold text-foreground/80">
        {t('accountsUsed', { n: count, max: FREE_PLAN_MAX_ACCOUNTS })}
      </span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {t('freePlan')}
      </span>
    </div>
  );
}
