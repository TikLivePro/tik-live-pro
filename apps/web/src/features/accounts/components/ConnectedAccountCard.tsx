'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getPlatformIdentityColor } from '@/lib/platform.consts';
import { getInitials } from '@/lib/text.utils';
import { AVATAR_COLORS } from '@/lib/avatar.consts';
import { useLocale } from '@/features/auth';
import { TikTokIcon, FacebookIcon } from '@/features/auth/components/AuthIcons';
import { useConnectTikTok } from '../hooks/useConnectTikTok';
import { useConnectFacebook } from '../hooks/useConnectFacebook';
import { PLATFORM_PERMISSION_SCOPES } from '../consts/accounts.consts';
import type { SocialAccount } from '@tik-live-pro/shared-types';

interface ConnectedAccountCardProps {
  account: SocialAccount;
  isRemoving: boolean;
  onDisconnect: (id: string) => void;
}

/**
 * One connected social account: gradient-ring avatar, status pill
 * (Connected / Expired), permission-scope chips, connected-since footer,
 * disconnect. Expired accounts get a "Reconnect to resume streaming" link.
 */
export function ConnectedAccountCard({
  account,
  isRemoving,
  onDisconnect,
}: ConnectedAccountCardProps): React.ReactElement {
  const t = useTranslations('accounts.page');
  const tAccounts = useTranslations('accounts');
  const { locale } = useLocale();
  const connectTikTok = useConnectTikTok();
  const connectFacebook = useConnectFacebook();

  const color = getPlatformIdentityColor(account.platform);
  const isTikTok = account.platform === 'tiktok';
  const scopes =
    account.platform === 'tiktok' || account.platform === 'facebook'
      ? PLATFORM_PERMISSION_SCOPES[account.platform]
      : [];

  const connectedSince = new Date(account.connectedAt).toLocaleDateString(locale, {
    month: 'short',
    year: 'numeric',
  });

  function handleReconnect(): void {
    if (isTikTok) connectTikTok();
    else connectFacebook();
  }

  return (
    <div className="card-surface flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'shrink-0 rounded-full p-[2px]',
            account.isActive ? 'bg-gradient-brand' : 'bg-border',
          )}
        >
          {account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={account.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className={cn(
                'h-11 w-11 rounded-full border-2 border-background object-cover',
                !account.isActive && 'opacity-60 grayscale',
              )}
            />
          ) : (
            <span
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full border-2 border-background text-sm font-bold text-white',
                AVATAR_COLORS[isTikTok ? 0 : 3],
                !account.isActive && 'opacity-60 grayscale',
              )}
            >
              {getInitials(account.displayName)}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold">{account.displayName}</p>
            {account.isActive ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                {tAccounts('status.connected')}
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                {tAccounts('status.expired')}
              </span>
            )}
          </div>

          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex shrink-0" style={color ? { color } : undefined}>
              {isTikTok ? <TikTokIcon className="h-3.5 w-3.5" /> : <FacebookIcon className="h-3.5 w-3.5" />}
            </span>
            <span className="truncate">{tAccounts(`platform.${account.platform}`)}</span>
          </p>

          {!account.isActive && (
            <button
              type="button"
              onClick={handleReconnect}
              className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 underline decoration-amber-600/40 underline-offset-2 transition-colors hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300"
            >
              <svg
                className="h-3 w-3 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              {t('reconnectHint')}
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {account.isActive ? t('permissionsLabel') : t('permissionsDisabledLabel')}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {scopes.map((scope) => (
            <span
              key={scope}
              className={cn(
                'rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium',
                account.isActive ? 'text-foreground/80' : 'text-muted-foreground/60',
              )}
            >
              {t(`scopes.${scope}`)}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-3">
        <p className="truncate text-xs text-muted-foreground">
          {t('connectedSince', { date: connectedSince })}
        </p>
        <button
          type="button"
          onClick={() => onDisconnect(account.id)}
          disabled={isRemoving}
          className="shrink-0 rounded-full border border-destructive/30 px-4 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('disconnect')}
        </button>
      </div>
    </div>
  );
}
