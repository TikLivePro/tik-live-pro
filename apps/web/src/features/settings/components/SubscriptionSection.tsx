'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { usePlans } from '../hooks/usePlans';
import { useSubscription } from '../hooks/useSubscription';
import { PlanCard } from './PlanCard';
import { CurrentPlanCard } from './CurrentPlanCard';
import { UsageMeters } from './UsageMeters';
import { PaymentMethodsRow } from './PaymentMethodsRow';
import { DashboardCardSkeleton } from '@/components/skeletons/DashboardCardSkeleton';
import type { SubscriptionTier } from '@tik-live-pro/shared-types';

export function SubscriptionSection(): React.JSX.Element {
  const t = useTranslations('settings');
  const { subscriptionTier } = useAuthStore();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: subscription } = useSubscription();

  const currentTier: SubscriptionTier = subscriptionTier ?? 'free';
  const currentPlan = plans?.find((p) => p.slug === currentTier);

  return (
    <section className="space-y-4">
      <h3 className="text-display text-lg font-bold">{t('subscription.title')}</h3>

      {plansLoading ? (
        <DashboardCardSkeleton pills={0} />
      ) : (
        <CurrentPlanCard plan={currentPlan} subscription={subscription} />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <UsageMeters plan={currentPlan} />
        <PaymentMethodsRow />
      </div>

      <p className="pt-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t('subscription.availablePlans')}
      </p>

      {plansLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <DashboardCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(plans ?? []).map((plan) => (
            <PlanCard key={plan.id} plan={plan} currentTier={currentTier} />
          ))}
        </div>
      )}
    </section>
  );
}
