'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function LandingFooter(): React.JSX.Element {
  const t = useTranslations('landing.footer');

  return (
    <footer className="border-t border-border/50 py-10">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="TikLivePro" className="h-7 w-7 rounded-lg object-contain" />
            <div>
              <p className="text-sm font-bold text-foreground">TikLivePro</p>
              <p className="text-xs text-muted-foreground">{t('tagline')}</p>
            </div>
          </div>

          <div className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/legal/terms" className="transition-colors hover:text-foreground">
              {t('terms')}
            </Link>
            <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
              {t('privacy')}
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{t('rights')}</p>
      </div>
    </footer>
  );
}
