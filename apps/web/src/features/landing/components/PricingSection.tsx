'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function PricingSection(): React.JSX.Element {
  const t = useTranslations('landing.pricing');

  return (
    <section className="border-t border-border/50 py-14 sm:py-16">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold tracking-widest text-brand">{t('sectionLabel')}</p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t('heading')}</h2>
          <p className="mt-3 text-base text-muted-foreground">{t('subtext')}</p>
        </div>

        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
          <PlanCard
            name={t('free.name')}
            price={t('free.price')}
            perMonth=""
            description={t('free.description')}
            features={[t('free.f1'), t('free.f2'), t('free.f3')]}
            cta={t('free.cta')}
            isPopular={false}
          />
          <PlanCard
            name={t('premium.name')}
            price={t('premium.price')}
            perMonth={t('perMonth')}
            description={t('premium.description')}
            features={[
              t('premium.f1'),
              t('premium.f2'),
              t('premium.f3'),
              t('premium.f4'),
              t('premium.f5'),
            ]}
            cta={t('premium.cta')}
            isPopular={true}
            popularLabel={t('mostPopular')}
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface PlanCardProps {
  name: string;
  price: string;
  perMonth: string;
  description: string;
  features: string[];
  cta: string;
  isPopular: boolean;
  popularLabel?: string;
}

function PlanCard({
  name,
  price,
  perMonth,
  description,
  features,
  cta,
  isPopular,
  popularLabel,
}: PlanCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border bg-card p-6',
        isPopular ? 'border-brand/50 shadow-lg shadow-brand/10' : 'border-border',
      )}
    >
      {isPopular && popularLabel && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-white">
          {popularLabel}
        </span>
      )}

      <div className="mb-6">
        <p className="mb-1 text-sm font-semibold text-foreground">{name}</p>
        <div className="flex items-end gap-1">
          <span className="text-4xl font-extrabold tracking-tight text-foreground">{price}</span>
          {perMonth && (
            <span className="mb-1 text-sm text-muted-foreground">{perMonth}</span>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
      </div>

      <ul className="mb-6 flex-1 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
              <CheckIcon />
            </span>
            {feature}
          </li>
        ))}
      </ul>

      <Link
        href="/auth/login"
        className={cn(
          'flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
          isPopular
            ? 'bg-brand text-white shadow-md shadow-brand/25 hover:bg-brand/90'
            : 'border border-border text-foreground hover:border-brand/40 hover:bg-muted/40',
        )}
      >
        {cta}
      </Link>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-2.5 w-2.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
