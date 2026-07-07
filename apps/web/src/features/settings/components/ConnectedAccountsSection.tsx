'use client';

import { useTranslations } from 'next-intl';
import { useSocialAccounts } from '@/features/accounts/hooks/useSocialAccounts';
import { useRemoveAccount } from '../hooks/useRemoveAccount';
import { useConnectTikTok } from '../hooks/useConnectTikTok';
import { useConnectFacebook } from '../hooks/useConnectFacebook';
import { AVATAR_COLORS } from '@/lib/avatar.consts';
import { getInitials } from '@/lib/text.utils';
import { TrashIcon, TikTokIcon, FacebookIcon } from '@/features/auth/components/AuthIcons';
import { cn } from '@/lib/utils';
import type { SocialAccount } from '@tik-live-pro/shared-types';

interface PlatformGroupProps {
  label: string;
  connectLabel: string;
  accounts: SocialAccount[];
  isLoading: boolean;
  isRemoving: boolean;
  colorOffset: number;
  onConnect: () => void;
  onRemove: (id: string) => void;
  icon: React.ReactNode;
}

function PlatformGroup({
  label,
  connectLabel,
  accounts,
  isLoading,
  isRemoving,
  colorOffset,
  onConnect,
  onRemove,
  icon,
}: PlatformGroupProps): React.JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-sm font-medium">{label}</span>
        </div>
        <button
          onClick={onConnect}
          className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          {connectLabel}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : accounts.length > 0 ? (
        <div className="space-y-2">
          {accounts.map((account, i) => (
            <div key={account.id} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
                  AVATAR_COLORS[(colorOffset + i) % AVATAR_COLORS.length],
                )}
              >
                {getInitials(account.displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{account.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(account.connectedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => onRemove(account.id)}
                disabled={isRemoving}
                className="rounded-lg p-1.5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                aria-label="Remove account"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-muted/30 py-3 text-center text-xs text-muted-foreground">
          —
        </p>
      )}
    </div>
  );
}

export function ConnectedAccountsSection(): React.JSX.Element {
  const t = useTranslations('settings');
  const { data: allAccounts, isLoading } = useSocialAccounts();
  const { mutate: removeAccount, isPending: removing } = useRemoveAccount();
  const connectTikTok = useConnectTikTok();
  const connectFacebook = useConnectFacebook();

  const tiktokAccounts = allAccounts?.filter((a) => a.platform === 'tiktok') ?? [];
  const facebookAccounts = allAccounts?.filter((a) => a.platform === 'facebook') ?? [];

  return (
    <section className="card-surface space-y-4 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t('connectedAccounts.sectionTitle')}
      </p>

      <PlatformGroup
        label={t('connectedAccounts.tiktokSection')}
        connectLabel={t('connectedAccounts.connectTikTok')}
        accounts={tiktokAccounts}
        isLoading={isLoading}
        isRemoving={removing}
        colorOffset={0}
        onConnect={connectTikTok}
        onRemove={(id) => removeAccount(id)}
        icon={<TikTokIcon className="h-4 w-4" />}
      />

      <div className="border-t border-border pt-4">
        <PlatformGroup
          label={t('connectedAccounts.facebookSection')}
          connectLabel={t('connectedAccounts.connectFacebook')}
          accounts={facebookAccounts}
          isLoading={isLoading}
          isRemoving={removing}
          colorOffset={3}
          onConnect={connectFacebook}
          onRemove={(id) => removeAccount(id)}
          icon={<FacebookIcon className="h-4 w-4" />}
        />
      </div>
    </section>
  );
}
