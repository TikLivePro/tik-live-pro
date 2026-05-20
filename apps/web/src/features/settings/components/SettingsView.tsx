'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { SubscriptionSection } from './SubscriptionSection';
import { SecuritySection } from './SecuritySection';
import { ConnectedAccountsSection } from './ConnectedAccountsSection';
import { BackArrowIcon } from '@/features/auth/components/AuthIcons';

export function SettingsView(): React.JSX.Element {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-2xl px-4 py-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <BackArrowIcon className="shrink-0" />
            {tCommon('back')}
          </Link>
          <h1 className="text-lg font-bold">{t('title')}</h1>
        </div>

        <SubscriptionSection />
        <SecuritySection />
        <ConnectedAccountsSection />
      </main>
    </div>
  );
}
