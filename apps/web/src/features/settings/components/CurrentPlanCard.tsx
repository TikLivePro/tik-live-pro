'use client';

import { useTranslations } from 'next-intl';
import type { Plan, Subscription } from '@tik-live-pro/shared-types';

interface CurrentPlanCardProps {
  plan: Plan | undefined;
  subscription: Subscription | null | undefined;
}

/** Gradient-bordered summary of the user's current plan with the renewal date. */
export function CurrentPlanCard({ plan, subscription }: CurrentPlanCardProps): React.ReactElement {
  const t = useTranslations('settings.subscription');

  const price = plan && plan.priceCents > 0
    ? `$${(plan.priceCents / 100).toFixed(2)}${t('pricePerMonth')}`
    : null;

  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="bg-gradient-brand rounded-card p-px">
      <div className="rounded-[calc(var(--radius-card)-1px)] bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t('currentPlanTitle')}
            </p>
            <p className="text-display mt-1 text-2xl font-extrabold">
              {plan?.name ?? t('priceFree')}
              {price && <span className="text-gradient-brand ml-2 text-lg font-bold">{price}</span>}
            </p>
          </div>
          <span className="bg-gradient-brand shadow-brand-glow rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
            {t('currentPlan')}
          </span>
        </div>
        {renewalDate && subscription?.status === 'active' && (
          <p className="mt-2 text-xs text-muted-foreground">{t('renewsOn', { date: renewalDate })}</p>
        )}
        {renewalDate && subscription?.status === 'canceled' && (
          <p className="mt-2 text-xs text-destructive">{t('cancelsOn', { date: renewalDate })}</p>
        )}
      </div>
    </div>
  );
}
