'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { LANDING_SECTION_IDS } from '../consts/landing.consts';

const STEP_KEYS = ['step1', 'step2', 'step3'] as const;

export function HowItWorksSection(): React.JSX.Element {
  const t = useTranslations('landing.howItWorks');

  return (
    <section
      id={LANDING_SECTION_IDS.howItWorks}
      className="scroll-mt-16 border-t border-border/50 py-14 sm:py-16"
    >
      <div className="container mx-auto max-w-5xl px-4">
        <div className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold tracking-widest text-brand">
            {t('sectionLabel')}
          </p>
          <h2 className="text-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t('heading')}
          </h2>
        </div>

        <div className="relative grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
          {/* Gradient connector: vertical on mobile, horizontal on md+ */}
          <div
            aria-hidden
            className="bg-gradient-brand absolute left-6 top-6 h-[calc(100%-3rem)] w-px opacity-30 md:hidden"
          />
          <div
            aria-hidden
            className="bg-gradient-brand absolute left-[16.666%] right-[16.666%] top-6 hidden h-px opacity-30 md:block"
          />

          {STEP_KEYS.map((key, i) => (
            <div key={key} className="relative flex items-start gap-4 md:flex-col md:items-center md:text-center">
              <span
                className={cn(
                  'bg-gradient-brand shadow-brand-glow relative z-10 flex h-12 w-12 shrink-0 items-center justify-center',
                  'rounded-full text-base font-bold text-white',
                )}
              >
                {i + 1}
              </span>
              <div>
                <h3 className="mb-1.5 text-base font-semibold text-foreground md:mt-4">
                  {t(`${key}.title`)}
                </h3>
                <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {t(`${key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
