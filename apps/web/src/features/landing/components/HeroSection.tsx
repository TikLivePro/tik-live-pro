'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { HeroPreview } from './HeroPreview';
import { SOCIAL_PROOF_AVATARS } from '../consts/landing.consts';

export function HeroSection(): React.JSX.Element {
  const t = useTranslations('landing.hero');

  return (
    <section className="relative overflow-hidden py-14 sm:py-20 md:py-24">
      {/* Layered ambient background: dot grid + drifting gradient orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="bg-grid-dots absolute inset-0" />
        <div className="animate-orb-drift absolute -top-24 left-1/2 h-[420px] w-[420px] -translate-x-[70%] rounded-full bg-brand/15 blur-[120px]" />
        <div className="animate-orb-drift absolute top-10 left-1/2 h-[380px] w-[380px] -translate-x-[10%] rounded-full bg-orange-500/10 blur-[110px] [animation-delay:-7s]" />
        <div className="absolute bottom-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-pink-500/10 blur-[130px]" />
      </div>

      <div className="container relative mx-auto max-w-4xl px-4 text-center">
        <div className="animate-fade-up mb-6 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
          {t('badge')}
        </div>

        <h1 className="text-display animate-fade-up mb-6 whitespace-pre-line text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl [animation-delay:0.1s]">
          {t('headlineStart')}
          <span className="bg-gradient-brand bg-clip-text text-transparent">
            {t('headlineHighlight')}
          </span>
          {t('headlineEnd')}
        </h1>

        <p className="animate-fade-up mx-auto mb-10 max-w-2xl text-base text-muted-foreground sm:text-lg [animation-delay:0.2s]">
          {t('subtext')}
        </p>

        <div className="animate-fade-up flex flex-col items-center justify-center gap-3 sm:flex-row [animation-delay:0.3s]">
          <Link
            href="/auth/login"
            className="btn-gradient group flex w-full items-center justify-center gap-2 px-7 py-3 text-sm font-semibold sm:w-auto"
          >
            {t('cta')}
            <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/auth/login"
            className={cn(
              'btn-ghost flex w-full items-center justify-center gap-2 px-7 py-3 text-sm font-semibold backdrop-blur-sm sm:w-auto',
              'transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40',
            )}
          >
            {t('ctaSecondary')}
          </Link>
        </div>

        <HeroPreview />

        {/* Social proof: overlapping avatar strip */}
        <div className="animate-fade-up mt-10 flex flex-col items-center justify-center gap-3 [animation-delay:0.5s]">
          <div className="flex items-center">
            {SOCIAL_PROOF_AVATARS.map(({ initial, colorClass }, i) => (
              <span
                key={`${initial}-${i}`}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white',
                  'ring-2 ring-background',
                  i > 0 && '-ml-2.5',
                  colorClass,
                )}
                aria-hidden
              >
                {initial}
              </span>
            ))}
            <span className="-ml-2.5 flex h-8 items-center justify-center rounded-full bg-muted px-2.5 text-xs font-semibold text-foreground ring-2 ring-background">
              {t('socialProofMore')}
            </span>
          </div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {t('socialProof')}
          </p>
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
