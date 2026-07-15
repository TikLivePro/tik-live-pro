'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getPlatformIdentityColor } from '@/lib/platform.consts';
import { TikTokIcon, FacebookIcon, SettingsGearIcon } from '@/features/auth/components/AuthIcons';
import { useConnectTikTok } from '../hooks/useConnectTikTok';
import { useConnectFacebook } from '../hooks/useConnectFacebook';
import { useRemoveAccount } from '../hooks/useRemoveAccount';
import type { SocialAccount } from '@tik-live-pro/shared-types';

interface AccountCardProps {
  account: SocialAccount;
}

function PlatformIcon({ platform }: { platform: SocialAccount['platform'] }): React.ReactElement {
  const color = getPlatformIdentityColor(platform);
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
      style={color ? { backgroundColor: `${color}26`, color } : undefined}
    >
      {platform === 'tiktok' ? <TikTokIcon className="h-4 w-4" /> : <FacebookIcon className="h-4 w-4" />}
    </span>
  );
}

export function AccountCard({ account }: AccountCardProps): React.ReactElement {
  const t = useTranslations('accounts');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const connectTikTok = useConnectTikTok();
  const connectFacebook = useConnectFacebook();
  const removeAccount = useRemoveAccount();

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  function handleReconnect(): void {
    setMenuOpen(false);
    if (account.platform === 'tiktok') connectTikTok();
    else connectFacebook();
  }

  return (
    <div className="stat-tile bg-surface-1 flex items-center gap-3 px-3 py-2.5 transition-colors hover:border-border">
      <PlatformIcon platform={account.platform} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{t(`platform.${account.platform}`)}</p>
        <p className="truncate text-xs text-muted-foreground">{account.displayName}</p>
      </div>

      {account.isActive ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          {t('status.connected')}
        </span>
      ) : (
        <button
          type="button"
          onClick={handleReconnect}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
        >
          <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {t('reconnect')}
        </button>
      )}

      {/* Kebab menu */}
      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label={t('manage')}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="19" r="1.6" />
          </svg>
        </button>

        {menuOpen && (
          <div className="animate-scale-in absolute right-0 top-8 z-30 w-44 overflow-hidden rounded-xl border border-border/80 bg-card py-1 shadow-xl shadow-black/10 dark:shadow-black/40">
            <Link
              href="/accounts"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
            >
              <SettingsGearIcon className="h-3.5 w-3.5 text-muted-foreground" />
              {t('manage')}
            </Link>
            {!account.isActive && (
              <button
                type="button"
                onClick={handleReconnect}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
              >
                <svg className="h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {t('reconnect')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                removeAccount.mutate(account.id);
              }}
              disabled={removeAccount.isPending}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/5',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              {t('disconnect')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
