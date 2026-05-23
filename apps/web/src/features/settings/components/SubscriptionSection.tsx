'use client';

import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { useSubscription } from '../hooks/useSubscription';
import { PREMIUM_PRICE } from '../consts/settings.consts';
import { cn } from '@/lib/utils';
import { CheckCircleIcon } from '@/features/auth/components/AuthIcons';

const PREMIUM_FEATURES = [
  'unlimitedAccounts',
  'analytics',
  'moderation',
  'recording',
] as const;

export function SubscriptionSection(): React.JSX.Element {
  const t = useTranslations('settings');
  const { data: subscription, isLoading } = useSubscription();
  const { subscriptionTier } = useAuthStore();

  const isPremium = subscriptionTier === 'premium';
  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';

  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

  const monthlyRate = isPremium ? `${PREMIUM_PRICE} $/mo` : '0 $/mo';

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t('subscription.sectionTitle')}
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-muted-foreground">{t('subscription.plan')}</span>
              <span className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase',
                isPremium ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground',
              )}>
                {isPremium ? 'Premium' : 'Free'}
              </span>
            </div>
            {isPremium && (
              <>
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
              </>
            )}
          </div>

          {isPremium ? (
            <button className="w-full rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted">
              {t('subscription.manageSubscription')}
            </button>
          ) : (
            <div className="rounded-xl border border-brand/20 bg-brand/5 p-4 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">{t('subscription.upgradeCta')}</p>
              <ul className="space-y-1.5">
                {PREMIUM_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-xs text-foreground">
                    <CheckCircleIcon className="h-3.5 w-3.5 text-brand" />
                    {t(`subscription.features.${feature}`)}
                  </li>
                ))}
              </ul>
              <button className={cn(
                'w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white',
                'hover:bg-brand/90 transition-colors shadow-sm shadow-brand/20',
              )}>
                {t('subscription.upgrade')} — {PREMIUM_PRICE} $/mo
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
