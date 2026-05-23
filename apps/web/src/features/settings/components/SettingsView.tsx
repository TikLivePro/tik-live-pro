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
import { BackArrowIcon } from '@/features/auth/components/AuthIcons';

export function SettingsView(): React.JSX.Element {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');

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
      </main>
    </div>
  );
}
