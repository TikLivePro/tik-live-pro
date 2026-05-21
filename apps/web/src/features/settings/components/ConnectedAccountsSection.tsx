'use client';

import { useTranslations } from 'next-intl';
import { useSocialAccounts } from '@/features/accounts/hooks/useSocialAccounts';
import { useRemoveAccount } from '../hooks/useRemoveAccount';
import { useConnectTikTok } from '../hooks/useConnectTikTok';
import { AVATAR_COLORS } from '@/lib/avatar.consts';
import { getInitials } from '@/lib/text.utils';
import { TrashIcon } from '@/features/auth/components/AuthIcons';
import { cn } from '@/lib/utils';

export function ConnectedAccountsSection() {
  const t = useTranslations('settings');
  const { data: tiktokAccounts, isLoading } = useSocialAccounts('tiktok');
  const { mutate: removeAccount, isPending: removing } = useRemoveAccount();
  const connectTikTok = useConnectTikTok();

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          {t('connectedAccounts.sectionTitle')}
        </p>
        <button
          onClick={connectTikTok}
          className="flex items-center gap-1 text-sm font-medium border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors"
        >
          {t('connectedAccounts.add')}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : tiktokAccounts && tiktokAccounts.length > 0 ? (
        <div className="space-y-2">
          {tiktokAccounts.map((account, i) => (
            <div key={account.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0',
                  AVATAR_COLORS[i % AVATAR_COLORS.length],
                )}
              >
                {getInitials(account.displayName)}
              </div>
              <span className="flex-1 text-sm font-medium truncate">{account.displayName}</span>
              <button
                onClick={() => removeAccount(account.id)}
                disabled={removing}
                className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50"
                aria-label="Remove account"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t('connectedAccounts.noAccounts')}
        </p>
      )}
    </section>
  );
}
