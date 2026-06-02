'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function HeroSection(): React.JSX.Element {
  const t = useTranslations('landing.hero');

  return (
    <section className="relative overflow-hidden py-14 sm:py-20 md:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-[500px] w-[500px] rounded-full bg-brand/10 blur-[140px]" />
      </div>

      <div className="container relative mx-auto max-w-4xl px-4 text-center">
        <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
          {t('badge')}
        </div>

        <h1 className="mb-6 whitespace-pre-line text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl">
          {t('headline')}
        </h1>

        <p className="mx-auto mb-10 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {t('subtext')}
        </p>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/auth/login"
            className={cn(
              'flex w-full items-center justify-center gap-2 sm:w-auto',
              'rounded-lg bg-brand px-7 py-3 text-sm font-semibold text-white',
              'shadow-lg shadow-brand/25 transition-colors hover:bg-brand/90',
            )}
          >
            {t('cta')}
          </Link>
          <Link
            href="/auth/login"
            className={cn(
              'flex w-full items-center justify-center gap-2 sm:w-auto',
              'rounded-lg border border-border bg-card px-7 py-3 text-sm font-semibold text-foreground',
              'transition-colors hover:border-brand/40 hover:bg-muted/40',
            )}
          >
            {t('ctaSecondary')}
          </Link>
        </div>

        <div className="mt-10 flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <span className="h-px w-16 bg-border" />
          <span className="tracking-wide">TikTok · Facebook</span>
          <span className="h-px w-16 bg-border" />
        </div>
      </div>
    </section>
  );
}
