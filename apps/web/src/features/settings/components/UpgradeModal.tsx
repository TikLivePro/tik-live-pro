'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { CheckCircleIcon } from '@/features/auth/components/AuthIcons';
import { usePlans } from '../hooks/usePlans';
import { FEATURE_LABEL_KEYS, UPGRADE_YEARLY_DISCOUNT } from '../consts/settings.consts';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user confirms — defaults to navigating to the subscription tab. */
  onUpgrade?: () => void;
}

type BillingPeriod = 'monthly' | 'yearly';

export function UpgradeModal({ open, onClose, onUpgrade }: UpgradeModalProps): React.ReactElement | null {
  const t = useTranslations('settings.subscription');
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const { data: plans } = usePlans();
  const plan = plans?.find((p) => p.slug === 'premium');

  if (!open) return null;

  const monthlyPrice = plan ? plan.priceCents / 100 : 0;
  const yearlyMonthlyEquivalent = monthlyPrice * (1 - UPGRADE_YEARLY_DISCOUNT);
  const displayPrice = period === 'monthly' ? monthlyPrice : yearlyMonthlyEquivalent;

  function handleUpgrade(): void {
    onClose();
    if (onUpgrade) {
      onUpgrade();
    } else {
      window.location.href = '/settings#subscription';
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gradient-brand w-full max-w-sm rounded-card p-px">
        <div className="rounded-[calc(var(--radius-card)-1px)] bg-surface-1 p-6">
          <div className="mb-5 flex items-start justify-between gap-2">
            <div>
              <span className="bg-gradient-brand inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                {t('upgradeModal.proFeatureBadge')}
              </span>
              <h3 className="mt-2 text-lg font-bold text-foreground">{t('upgradeModal.title')}</h3>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5">
              {(['monthly', 'yearly'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors',
                    period === p ? 'bg-muted text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {t(`upgradeModal.${p}`)}
                </button>
              ))}
            </div>
          </div>

          <ul className="mb-6 space-y-3">
            {(plan?.features ?? []).map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-foreground">
                <CheckCircleIcon className="h-4 w-4 shrink-0 text-brand" />
                {t(FEATURE_LABEL_KEYS[f] as Parameters<typeof t>[0])}
              </li>
            ))}
          </ul>

          <button type="button" onClick={handleUpgrade} className="btn-gradient w-full py-3 text-sm font-bold">
            {t('upgradeModal.upgradeNow', { price: `$${displayPrice.toFixed(2)}` })}
          </button>
          {period === 'yearly' && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {t('upgradeModal.billedYearly', { percent: UPGRADE_YEARLY_DISCOUNT * 100 })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
