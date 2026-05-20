'use client';

import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useSocialAccounts } from '../hooks/useSocialAccounts';
import { AccountCard } from './AccountCard';

export function AccountList() {
  const t = useTranslations('accounts');
  const { data: accounts, isLoading } = useSocialAccounts();
  const { subscriptionTier } = useAuthStore();
  const isFree = subscriptionTier === 'free';

  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t('title')}</h2>
        <button className="text-sm text-brand font-medium hover:underline">{t('connect')}</button>
      </div>

      {isFree && (
        <p className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
          {t('limit.freemium')}{' '}
          <span className="font-semibold text-brand">{t('limit.upgrade')}</span>
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {accounts?.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}
    </div>
  );
}
