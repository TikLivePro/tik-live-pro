'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useTheme, useLocale, useAuthStore, UserMenu, SunIcon, MoonIcon } from '@/features/auth';
import { MobileNavSheet } from './MobileNavSheet';
import { LANDING_SECTION_IDS } from '../consts/landing.consts';

export function LandingNav(): React.JSX.Element {
  const t = useTranslations('landing.nav');
  const { theme, toggle: toggleTheme } = useTheme();
  const { locale, setLocale, supportedLocales } = useLocale();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <header className="glass-header sticky top-0 z-40 border-b border-border/50">
      <div className="container mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <img src="/logo.png" alt="" className="h-7 w-7 rounded-lg object-contain" />
          <span className="text-gradient-brand text-display text-base font-extrabold">
            TikLivePro
          </span>
        </Link>

        <nav className="mx-auto hidden items-center gap-1 md:flex">
          <Link
            href={`#${LANDING_SECTION_IDS.features}`}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('features')}
          </Link>
          <Link
            href={`#${LANDING_SECTION_IDS.howItWorks}`}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('howItWorks')}
          </Link>
          <Link
            href={`#${LANDING_SECTION_IDS.pricing}`}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('pricing')}
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <div className="hidden items-center gap-1 rounded-full border border-border bg-card p-0.5 sm:flex">
            {supportedLocales.map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                aria-label={`Switch to ${l}`}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium uppercase transition-colors',
                  locale === l
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {l}
              </button>
            ))}
          </div>

          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="btn-ghost flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
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
                className="btn-gradient hidden items-center px-4 py-1.5 text-sm font-semibold sm:inline-flex"
              >
                {t('goLiveFree')}
              </Link>
            </>
          )}

          <button
            onClick={() => setSheetOpen((o) => !o)}
            aria-label={sheetOpen ? t('closeMenu') : t('openMenu')}
            aria-expanded={sheetOpen}
            className="btn-ghost flex h-8 w-8 items-center justify-center text-foreground md:hidden"
          >
            {sheetOpen ? <CloseIcon className="h-4 w-4" /> : <MenuIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <MobileNavSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </header>
  );
}

// ---------------------------------------------------------------------------

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}
