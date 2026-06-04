'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useTheme, useLocale, useAuthStore, UserMenu, SunIcon, MoonIcon, GlobeIcon } from '@/features/auth';

export function LandingNav(): React.JSX.Element {
  const t = useTranslations('landing.nav');
  const { theme, toggle: toggleTheme } = useTheme();
  const { locale, setLocale, supportedLocales } = useLocale();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <img src="/logo.png" alt="TikLivePro" className="h-7 w-7 rounded-lg object-contain" />
          <span className="hidden text-sm font-bold sm:block">TikLivePro</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
            {supportedLocales.map((l, i) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                aria-label={`Switch to ${l}`}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium uppercase transition-colors',
                  locale === l
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {i === 0 && <GlobeIcon className="h-3 w-3" />}
                {l}
              </button>
            ))}
          </div>

          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card',
              'text-muted-foreground transition-colors hover:text-foreground',
            )}
          >
            {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          </button>

          {isAuthenticated ? (
            <UserMenu showDashboardLink />
          ) : (
            <>
              <Link
                href="/auth/login"
                className="hidden px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
              >
                {t('signIn')}
              </Link>

              <Link
                href="/auth/login"
                className={cn(
                  'rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white',
                  'shadow-sm transition-colors hover:bg-brand/90',
                )}
              >
                {t('getStarted')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
