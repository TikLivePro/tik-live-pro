'use client';

import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useSubscription } from '../hooks/useSubscription';
import { PREMIUM_PRICE } from '../consts/settings.consts';
import { cn } from '@/lib/utils';
import { CheckCircleIcon } from '@/features/auth/components/AuthIcons';

export function SubscriptionSection() {
  const t = useTranslations('settings');
  const { data: subscription, isLoading } = useSubscription();
  const { subscriptionTier } = useAuthStore();

  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';
  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';
  const monthlyRate = subscriptionTier === 'premium' ? `${PREMIUM_PRICE} $/mois` : '0 $/mois';

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {t('subscription.sectionTitle')}
      </p>
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-5 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-muted-foreground">{t('subscription.status')}</span>
            <span className={cn('flex items-center gap-1.5 text-sm font-medium', isActive ? 'text-green-500' : 'text-muted-foreground')}>
              {isActive && <CheckCircleIcon />}
              {isActive ? t('subscription.statusActive') : t('subscription.statusInactive')}
            </span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-muted-foreground">{t('subscription.nextRenewal')}</span>
            <span className="text-sm font-medium">{renewalDate}</span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-muted-foreground">{t('subscription.monthlyRate')}</span>
            <span className="text-sm font-medium">{monthlyRate}</span>
          </div>
        </div>
      )}
    </section>
  );
}
