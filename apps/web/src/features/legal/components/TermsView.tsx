'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const SECTION_KEYS = [
  'acceptance',
  'description',
  'eligibility',
  'account',
  'acceptable',
  'thirdParty',
  'billing',
  'ip',
  'liability',
  'termination',
  'changes',
  'contact',
] as const;

export function TermsView(): React.JSX.Element {
  const t = useTranslations('legal');

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {t('backHome')}
          </Link>
          <span className="text-border">/</span>
          <span className="text-sm font-medium">{t('terms.title')}</span>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-10 md:py-16">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('terms.title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('lastUpdated')}</p>
        </div>

        <div className="space-y-8">
          {SECTION_KEYS.map((key) => (
            <section key={key}>
              <h2
                className={cn(
                  'mb-3 text-base font-semibold md:text-lg',
                  key === 'contact' && 'text-primary',
                )}
              >
                {t(`terms.sections.${key}.title`)}
              </h2>
              <p className="leading-7 text-muted-foreground">
                {t(`terms.sections.${key}.body`)}
              </p>
            </section>
          ))}
        </div>

        <footer className="mt-16 border-t border-border/50 pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            TikLivePro &mdash;{' '}
            <Link href="/legal/privacy" className="underline underline-offset-4 hover:text-foreground">
              {t('privacy.title')}
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
