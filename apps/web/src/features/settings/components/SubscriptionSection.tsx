'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { usePlans } from '../hooks/usePlans';
import { useSubscription } from '../hooks/useSubscription';
import { PlanCard } from './PlanCard';
import type { SubscriptionTier } from '@tik-live-pro/shared-types';

export function SubscriptionSection(): React.JSX.Element {
  const t = useTranslations('settings');
  const { subscriptionTier } = useAuthStore();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: subscription } = useSubscription();

  const currentTier: SubscriptionTier = subscriptionTier ?? 'free';

  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t('subscription.sectionTitle')}
        </p>
        {renewalDate && subscription?.status === 'active' && (
          <p className="text-xs text-muted-foreground">
            {t('subscription.renewsOn', { date: renewalDate })}
          </p>
        )}
        {subscription?.status === 'canceled' && renewalDate && (
          <p className="text-xs text-destructive">
            {t('subscription.cancelsOn', { date: renewalDate })}
          </p>
        )}
      </div>

      {plansLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl bg-muted" />
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
