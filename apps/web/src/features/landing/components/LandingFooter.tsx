'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useLocale } from '@/features/auth';
import { LANDING_SECTION_IDS } from '../consts/landing.consts';

export function LandingFooter(): React.JSX.Element {
  const t = useTranslations('landing.footer');
  const { locale, setLocale, supportedLocales } = useLocale();

  return (
    <footer className="border-t border-border/50 py-12">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <Link href="/" className="mb-3 flex items-center gap-2">
              <img src="/logo.png" alt="" className="h-7 w-7 rounded-lg object-contain" />
              <span className="text-gradient-brand text-display text-base font-extrabold">
                TikLivePro
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{t('tagline')}</p>
          </div>

          {/* Product */}
          <FooterColumn title={t('productTitle')}>
            <FooterLink href={`#${LANDING_SECTION_IDS.features}`}>{t('features')}</FooterLink>
            <FooterLink href={`#${LANDING_SECTION_IDS.howItWorks}`}>{t('howItWorks')}</FooterLink>
            <FooterLink href={`#${LANDING_SECTION_IDS.pricing}`}>{t('pricing')}</FooterLink>
          </FooterColumn>

          {/* Legal */}
          <FooterColumn title={t('legalTitle')}>
            <FooterLink href="/legal/privacy">{t('privacy')}</FooterLink>
            <FooterLink href="/legal/terms">{t('terms')}</FooterLink>
            <FooterLink href="/data-deletion">{t('dataDeletion')}</FooterLink>
          </FooterColumn>

          {/* Language */}
          <div>
            <p className="mb-3 text-sm font-semibold text-foreground">{t('languageTitle')}</p>
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-0.5">
              {supportedLocales.map((l) => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  aria-label={`Switch to ${l}`}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium uppercase transition-colors',
                    locale === l
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-border/50 pt-6">
          <p className="text-center text-xs text-muted-foreground sm:text-left">{t('rights')}</p>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-foreground">{title}</p>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
      </Link>
    </li>
  );
}
