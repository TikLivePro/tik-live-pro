'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSocialAccounts } from '../hooks/useSocialAccounts';
import { ConnectAccountModal } from './ConnectAccountModal';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useRemoveAccount } from '../hooks/useRemoveAccount';
import { ConnectedAccountCard } from './ConnectedAccountCard';
import { LockedAccountSlot } from './LockedAccountSlot';
import { NoAccountsEmptyState } from './NoAccountsEmptyState';
import { FREE_PLAN_MAX_ACCOUNTS } from '../consts/accounts.consts';

/** Card grid of connected social accounts + connect / locked / empty states. */
export function ConnectedAccountsSection(): React.JSX.Element {
  const t = useTranslations('accounts.page');
  const { data: accounts, isLoading } = useSocialAccounts();
  const { mutate: removeAccount, isPending: removing } = useRemoveAccount();
  const { subscriptionTier } = useAuthStore();
  const [connectOpen, setConnectOpen] = useState(false);

  const isFree = (subscriptionTier ?? 'free') === 'free';
  const count = accounts?.length ?? 0;
  const limitReached = isFree && count >= FREE_PLAN_MAX_ACCOUNTS;

  return (
    <section className="space-y-4">
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-40 rounded-card" />
          ))}
        </div>
      ) : count === 0 ? (
        <NoAccountsEmptyState onConnect={() => setConnectOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(accounts ?? []).map((account) => (
            <ConnectedAccountCard
              key={account.id}
              account={account}
              isRemoving={removing}
              onDisconnect={(id) => removeAccount(id)}
            />
          ))}

          {!limitReached && (
            <button
              type="button"
              onClick={() => setConnectOpen(true)}
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-muted/10 p-6 text-center transition-colors hover:border-brand/50 hover:bg-muted/30"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground">
                +
              </span>
              <span className="text-sm font-semibold">{t('connectPlatform')}</span>
              <span className="text-xs text-muted-foreground">{t('connectPlatformHint')}</span>
            </button>
          )}

          {limitReached && <LockedAccountSlot />}
        </div>
      )}

      <ConnectAccountModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </section>
  );
}
