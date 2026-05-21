'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text.utils';
import type { SocialAccount } from '@tik-live-pro/shared-types';

interface AccountCardProps {
  account: SocialAccount;
}

export function AccountCard({ account }: AccountCardProps) {
  const t = useTranslations('accounts');

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
      {account.avatarUrl ? (
        <Image
          src={account.avatarUrl}
          alt={account.displayName}
          width={36}
          height={36}
          className="rounded-full"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
          {getInitials(account.displayName)}
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
