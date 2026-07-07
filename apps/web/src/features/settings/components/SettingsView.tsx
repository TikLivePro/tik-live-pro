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
import { CreatorLayout } from '@/components/CreatorLayout';
import { useSidebar } from '@/components/SidebarContext';

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

  const { toggleCollapse, toggleOpen } = useSidebar();

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
              aria-label="Toggle sidebar"
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

      <main className="animate-fade-up container relative mx-auto max-w-2xl space-y-4 px-4 py-6">
        <ProfileSection />
        <AppearanceSection />
        <NotificationsSection />
        <SubscriptionSection />
        <ConnectedAccountsSection />
        <SecuritySection />

        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 py-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOutIcon className="h-4 w-4" />
          {tAuth('signOut')}
        </button>
      </main>
      </div>
    </CreatorLayout>
  );
}
