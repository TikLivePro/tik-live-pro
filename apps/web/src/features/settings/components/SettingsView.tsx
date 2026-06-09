'use client';

import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ProfileSection } from './ProfileSection';
import { AppearanceSection } from './AppearanceSection';
import { NotificationsSection } from './NotificationsSection';
import { SubscriptionSection } from './SubscriptionSection';
import { SecuritySection } from './SecuritySection';
import { ConnectedAccountsSection } from './ConnectedAccountsSection';
import { BackArrowIcon, LogOutIcon } from '@/features/auth/components/AuthIcons';
import { useAuth } from '@/features/auth';
import { useQueryClient } from '@tanstack/react-query';

export function SettingsView(): React.JSX.Element {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const tAuth = useTranslations('auth');
  const tAccounts = useTranslations('accounts');
  const tNotifications = useTranslations('notifications');
  const { logout } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) {
      const platformLabel = connected.charAt(0).toUpperCase() + connected.slice(1);
      toast.success(tNotifications('accountConnected', { platform: platformLabel }));
      void queryClient.invalidateQueries({ queryKey: ['social-accounts'] });
    } else if (error === 'connect_failed') {
      toast.error(tAccounts('errors.connectFailed'));
    }
    if (connected ?? error) {
      const url = new URL(window.location.href);
      url.searchParams.delete('connected');
      url.searchParams.delete('error');
      router.replace(url.pathname + (url.search || ''), { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="mb-2 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <BackArrowIcon className="shrink-0" />
            {tCommon('back')}
          </Link>
          <h1 className="text-lg font-bold">{t('title')}</h1>
        </div>

        <ProfileSection />
        <AppearanceSection />
        <NotificationsSection />
        <SubscriptionSection />
        <ConnectedAccountsSection />
        <SecuritySection />

        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOutIcon className="h-4 w-4" />
          {tAuth('signOut')}
        </button>
      </main>
    </div>
  );
}
