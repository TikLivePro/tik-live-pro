'use client';

import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { BackArrowIcon } from '@/features/auth/components/AuthIcons';
import { CreatorLayout } from '@/components/CreatorLayout';
import { useSidebar } from '@/components/SidebarContext';
import { ConnectedAccountsSection } from './ConnectedAccountsSection';
import { AccountsUsageBadge } from './AccountsUsageBadge';

export function AccountsView(): React.JSX.Element {
  const t = useTranslations('accounts.page');
  const tCommon = useTranslations('common');
  const tAccounts = useTranslations('accounts');
  const tNotifications = useTranslations('notifications');
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toggleCollapse, toggleOpen } = useSidebar();

  // OAuth connect callback feedback (?connected= / ?error=)
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
      router.replace(url.pathname + (url.search || '') + url.hash, { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CreatorLayout>
      <div className="relative min-h-screen bg-background flex-1 w-full">
        {/* Ambient background */}
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="animate-orb-drift absolute -top-32 right-[-10%] h-80 w-80 rounded-full bg-brand/10 blur-3xl" />
          <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-[hsl(15_90%_55%)]/8 blur-3xl" />
        </div>

        <header className="glass-header sticky top-0 z-40 border-b border-border/70">
          <div className="flex h-14 items-center gap-3 px-4">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth >= 1024) {
                  toggleCollapse();
                } else {
                  toggleOpen();
                }
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground mr-1"
              aria-label={tCommon('toggleSidebar')}
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
            <Link
              href="/dashboard"
              aria-label={tCommon('back')}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <BackArrowIcon className="shrink-0" />
            </Link>
            <h1 className="text-lg font-bold tracking-tight">{t('title')}</h1>
          </div>
        </header>

        <main className="animate-fade-up container relative mx-auto max-w-4xl px-4 py-6 sm:py-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-display text-3xl font-extrabold sm:text-4xl">{t('title')}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{t('subtitle')}</p>
            </div>
            <AccountsUsageBadge />
          </div>

          <ConnectedAccountsSection />
        </main>
      </div>
    </CreatorLayout>
  );
}
