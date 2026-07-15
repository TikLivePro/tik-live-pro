'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/features/auth/store/auth.store';

/**
 * Minimal glass top bar for the public watch page.
 * Logged-out viewers get "Log in" (ghost) + "Go Live" (gradient);
 * logged-in viewers get a single "Dashboard" gradient CTA.
 */
export function WatchTopBar(): React.ReactElement {
  const t = useTranslations('watch');
  const { isAuthenticated } = useAuthStore();

  return (
    <header className="glass-header sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--card-border-color)] px-4 sm:px-6">
      <Link href="/" className="flex shrink-0 items-center gap-2">
        <img src="/logo.png" alt="TikLivePro" className="h-7 w-7 object-contain" />
        <span className="text-gradient-brand text-base font-bold tracking-tight">TikLivePro</span>
      </Link>

      <div className="flex-1" />

      {isAuthenticated ? (
        <Link
          href="/dashboard"
          className="btn-gradient px-4 py-1.5 text-sm font-semibold"
        >
          {t('nav.dashboard')}
        </Link>
      ) : (
        <>
          <Link
            href="/auth/login"
            className="btn-ghost px-4 py-1.5 text-sm font-semibold"
          >
            {t('nav.login')}
          </Link>
          <Link
            href="/auth/login"
            className="btn-gradient px-4 py-1.5 text-sm font-semibold"
          >
            {t('nav.goLive')}
          </Link>
        </>
      )}
    </header>
  );
}
