'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useLocale } from '@/features/auth';
import { LANDING_SECTION_IDS } from '../consts/landing.consts';

interface MobileNavSheetProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNavSheet({ open, onClose }: MobileNavSheetProps): React.JSX.Element | null {
  const t = useTranslations('landing.nav');
  const { locale, setLocale, supportedLocales } = useLocale();

  if (!open) return null;

  return (
    <div className="md:hidden">
      <button
        aria-label={t('closeMenu')}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
      />

      <div className="glass-overlay fixed inset-x-3 top-16 z-50 rounded-card border border-border p-4 shadow-2xl">
        <nav className="flex flex-col">
          <Link
            href={`#${LANDING_SECTION_IDS.features}`}
            onClick={onClose}
            className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            {t('features')}
          </Link>
          <Link
            href={`#${LANDING_SECTION_IDS.howItWorks}`}
            onClick={onClose}
            className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            {t('howItWorks')}
          </Link>
          <Link
            href={`#${LANDING_SECTION_IDS.pricing}`}
            onClick={onClose}
            className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
          >
            {t('pricing')}
          </Link>
        </nav>

        <div className="my-3 h-px bg-border/60" />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full border border-border bg-card p-0.5">
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

          <Link href="/auth/login" onClick={onClose} className="btn-gradient px-4 py-2 text-sm">
            {t('goLiveFree')}
          </Link>
        </div>
      </div>
    </div>
  );
}
