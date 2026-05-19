'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import type { SocialAccount } from '@tik-live-pro/shared-types';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

function useSocialAccounts() {
  const { accessToken } = useAuthStore();
  return useQuery<SocialAccount[]>({
    queryKey: ['social-accounts'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/accounts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to load accounts');
      const { data } = await res.json() as { data: SocialAccount[] };
      return data;
    },
    enabled: !!accessToken,
  });
}

export function AccountList() {
  const t = useTranslations('accounts');
  const { data: accounts, isLoading } = useSocialAccounts();
  const { subscriptionTier } = useAuthStore();
  const isFree = subscriptionTier === 'free';

  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t('title')}</h2>
        <button className="text-sm text-brand font-medium hover:underline">
          {t('connect')}
        </button>
      </div>

      {isFree && (
        <p className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
          {t('limit.freemium')}
          {' '}
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

function AccountCard({ account }: { account: SocialAccount }) {
  const t = useTranslations('accounts');

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
      {account.avatarUrl ? (
        <Image src={account.avatarUrl} alt={account.displayName} width={36} height={36} className="rounded-full" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
          {account.displayName[0]?.toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{account.displayName}</p>
        <p className="text-xs text-muted-foreground">{t(`platform.${account.platform}`)}</p>
      </div>
      <span
        className={cn(
          'text-xs font-medium px-2 py-0.5 rounded-full',
          account.isActive
            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {account.isActive ? t('status.connected') : t('status.disconnected')}
      </span>
    </div>
  );
}
