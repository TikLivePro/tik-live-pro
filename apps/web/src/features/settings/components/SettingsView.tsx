'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ProfileSection } from './ProfileSection';
import { AppearanceSection } from './AppearanceSection';
import { NotificationsSection } from './NotificationsSection';
import { SubscriptionSection } from './SubscriptionSection';
import { SecuritySection } from './SecuritySection';
import { ConnectedAccountsSection } from './ConnectedAccountsSection';
import { BackArrowIcon, LogOutIcon } from '@/features/auth/components/AuthIcons';
import { useAuth } from '@/features/auth';

export function SettingsView(): React.JSX.Element {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const tAuth = useTranslations('auth');
  const { logout } = useAuth();

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
