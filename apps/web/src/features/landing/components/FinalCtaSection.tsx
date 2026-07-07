'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function FinalCtaSection(): React.JSX.Element {
  const t = useTranslations('landing.finalCta');

  return (
    <section className="py-14 sm:py-16">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="bg-gradient-brand shadow-brand-glow relative overflow-hidden rounded-card px-6 py-10 sm:px-10 sm:py-12">
          {/* Soft highlight sweep across the band */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(255,255,255,0.25),transparent_55%)]"
          />

          <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-display mb-2 text-2xl font-extrabold text-white sm:text-3xl">
                {t('heading')}
              </h2>
              <p className="max-w-md text-sm text-white/85 sm:text-base">{t('subtext')}</p>
            </div>

            <Link
              href="/auth/login"
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition-transform duration-200 hover:-translate-y-0.5"
            >
              {t('cta')}
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
