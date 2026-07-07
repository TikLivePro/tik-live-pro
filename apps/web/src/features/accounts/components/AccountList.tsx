'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useSocialAccounts } from '../hooks/useSocialAccounts';
import { AccountCard } from './AccountCard';
import { ConnectAccountModal } from './ConnectAccountModal';

export function AccountList(): React.ReactElement {
  const t = useTranslations('accounts');
  const { data: accounts, isLoading } = useSocialAccounts();
  const { subscriptionTier } = useAuthStore();
  const isFree = subscriptionTier === 'free';
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="card-surface space-y-3 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold tracking-tight">{t('title')}</h2>
        <Link href="/settings" className="text-xs font-semibold text-brand hover:underline">
          {t('manage')}
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-[58px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {accounts?.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}

      <button
        onClick={() => setModalOpen(true)}
        className="chip-platform w-full justify-center border-dashed py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {t('connect')}
      </button>
      <ConnectAccountModal open={modalOpen} onClose={() => setModalOpen(false)} />

      {isFree && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-brand/15 bg-brand/5 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            {t('limit.freemiumShort')}
          </span>
          <Link href="/settings" className="shrink-0 text-xs font-semibold text-brand hover:underline">
            {t('limit.upgradeCta')}
          </Link>
        </div>
      )}
    </div>
  );
}
