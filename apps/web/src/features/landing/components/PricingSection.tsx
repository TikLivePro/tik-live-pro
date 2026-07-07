'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  LANDING_SECTION_IDS,
  YEARLY_DISCOUNT_LABEL,
  type BillingPeriod,
} from '../consts/landing.consts';

export function PricingSection(): React.JSX.Element {
  const t = useTranslations('landing.pricing');
  const [period, setPeriod] = React.useState<BillingPeriod>('monthly');

  return (
    <section
      id={LANDING_SECTION_IDS.pricing}
      className="scroll-mt-16 border-t border-border/50 py-14 sm:py-16"
    >
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mb-8 text-center">
          <p className="mb-3 text-xs font-semibold tracking-widest text-brand">{t('sectionLabel')}</p>
          <h2 className="text-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t('heading')}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">{t('subtext')}</p>
        </div>

        {/* Monthly / yearly toggle */}
        <div className="mb-10 flex justify-center">
          <div
            role="group"
            aria-label={t('billingToggleLabel')}
            className="flex items-center gap-1 rounded-full border border-border bg-card p-1"
          >
            <BillingButton
              active={period === 'monthly'}
              onClick={() => setPeriod('monthly')}
              label={t('monthly')}
            />
            <BillingButton
              active={period === 'yearly'}
              onClick={() => setPeriod('yearly')}
              label={t('yearly')}
              discount={YEARLY_DISCOUNT_LABEL}
            />
          </div>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          <PlanCard
            name={t('free.name')}
            price={t('free.price')}
            perPeriod=""
            description={t('free.description')}
            features={[t('free.f1'), t('free.f2'), t('free.f3')]}
            cta={t('free.cta')}
            isPopular={false}
          />
          <PlanCard
            name={t('pro.name')}
            price={period === 'monthly' ? t('pro.priceMonthly') : t('pro.priceYearly')}
            perPeriod={t('perMonth')}
            billedYearly={period === 'yearly' ? t('billedYearly') : undefined}
            description={t('pro.description')}
            features={[t('pro.f1'), t('pro.f2'), t('pro.f3'), t('pro.f4'), t('pro.f5')]}
            cta={t('pro.cta')}
            isPopular={true}
            popularLabel={t('mostPopular')}
          />
          <PlanCard
            name={t('studio.name')}
            price={period === 'monthly' ? t('studio.priceMonthly') : t('studio.priceYearly')}
            perPeriod={t('perMonth')}
            billedYearly={period === 'yearly' ? t('billedYearly') : undefined}
            description={t('studio.description')}
            features={[t('studio.f1'), t('studio.f2'), t('studio.f3'), t('studio.f4')]}
            cta={t('studio.cta')}
            isPopular={false}
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface BillingButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  discount?: string;
}

function BillingButton({ active, onClick, label, discount }: BillingButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-gradient-brand text-white shadow-brand-glow' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {discount && (
        <span
          className={cn(
            'rounded-full px-1.5 py-px text-[10px] font-bold',
            active ? 'bg-white/20 text-white' : 'bg-brand/15 text-brand',
          )}
        >
          {discount}
        </span>
      )}
    </button>
  );
}

interface PlanCardProps {
  name: string;
  price: string;
  perPeriod: string;
  billedYearly?: string | undefined;
  description: string;
  features: string[];
  cta: string;
  isPopular: boolean;
  popularLabel?: string;
}

function PlanCard({
  name,
  price,
  perPeriod,
  billedYearly,
  description,
  features,
  cta,
  isPopular,
  popularLabel,
}: PlanCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-card border bg-card p-6 transition-all duration-300',
        isPopular
          ? 'border-brand/50 shadow-xl shadow-brand/15 hover:shadow-2xl hover:shadow-brand/25 md:-translate-y-2'
          : 'border-border hover:-translate-y-1 hover:border-brand/25 hover:shadow-lg',
      )}
    >
      {isPopular && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 -top-px h-px bg-gradient-to-r from-transparent via-brand to-transparent"
        />
      )}
      {isPopular && popularLabel && (
        <span className="bg-gradient-brand shadow-brand-glow absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-0.5 text-xs font-semibold text-white">
          {popularLabel}
        </span>
      )}

      <div className="mb-6">
        <p className="mb-1 text-sm font-semibold text-foreground">{name}</p>
        <div className="flex items-end gap-1">
          <span className="text-display text-4xl font-extrabold tracking-tight text-foreground">
            {price}
          </span>
          {perPeriod && <span className="mb-1 text-sm text-muted-foreground">{perPeriod}</span>}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {billedYearly ?? description}
        </p>
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
          'flex items-center justify-center px-4 py-2.5 text-sm font-semibold',
          isPopular ? 'btn-gradient' : 'btn-ghost hover:border-brand/40',
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
