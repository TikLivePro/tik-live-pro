'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { CheckCircleIcon } from '@/features/auth/components/AuthIcons';
import { API_BASE } from '@/lib/api';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { PaymentMethodModal } from './PaymentMethodModal';
import type { Plan, SubscriptionTier } from '@tik-live-pro/shared-types';
import type { PaymentMethod, CheckoutResult } from '../interfaces/payment.interfaces';

interface PlanCardProps {
  plan: Plan;
  currentTier: SubscriptionTier;
}

const FEATURE_LABEL_KEYS: Record<string, string> = {
  unlimited_accounts: 'features.unlimitedAccounts',
  analytics_dashboard: 'features.analytics',
  comment_moderation: 'features.moderation',
  stream_recording: 'features.recording',
  priority_support: 'features.prioritySupport',
};

export function PlanCard({ plan, currentTier }: PlanCardProps): React.JSX.Element {
  const t = useTranslations('settings.subscription');
  const { accessToken } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const isCurrent = plan.slug === currentTier;
  const price = plan.priceCents === 0
    ? t('priceFree')
    : `$${(plan.priceCents / 100).toFixed(2)}${t('pricePerMonth')}`;

  const isHighlighted = plan.slug === 'premium';

  function handleSelectClick(): void {
    if (isCurrent || loading) return;
    if (plan.slug === 'free') {
      void handleCancel();
    } else {
      setShowModal(true);
    }
  }

  async function handleCancel(): Promise<void> {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/billing/subscriptions/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } finally {
      setLoading(false);
    }
  }

  async function handlePaymentConfirm(method: PaymentMethod, phone?: string): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/billing/subscriptions/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          successUrl: `${window.location.origin}/settings?upgraded=1`,
          cancelUrl: `${window.location.origin}/settings`,
          paymentMethod: method,
          ...(phone ? { phoneNumber: phone } : {}),
        }),
      });

      if (!res.ok) return;

      const { data } = (await res.json()) as { data: CheckoutResult };

      if (method === 'stripe' && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      setShowModal(false);
      setPendingMessage(data.instructions ?? t('paymentMethod.orderPending'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {showModal && (
        <PaymentMethodModal
          planName={plan.name}
          planPrice={price}
          loading={loading}
          onConfirm={handlePaymentConfirm}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className={cn(
        'relative flex flex-col rounded-2xl border p-4 transition-shadow',
        isCurrent
          ? 'border-brand bg-brand/5 shadow-sm shadow-brand/10'
          : 'border-border bg-card hover:border-brand/40',
        isHighlighted && !isCurrent && 'border-brand/30',
      )}>
        {isHighlighted && (
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            {t('popular')}
          </span>
        )}

        <div className="mb-3">
          <p className="text-sm font-bold text-foreground">{plan.name}</p>
          <p className="mt-0.5 text-xl font-extrabold text-foreground">{price}</p>
          {plan.maxSocialAccounts !== null ? (
            <p className="text-xs text-muted-foreground">{t('accountsLimit', { n: plan.maxSocialAccounts })}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('accountsUnlimited')}</p>
          )}
        </div>

        <ul className="mb-4 flex-1 space-y-1.5">
          {plan.features.length === 0 ? (
            <li className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              {t('features.basicStreaming')}
            </li>
          ) : (
            plan.features.map((f: string) => (
              <li key={f} className="flex items-center gap-2 text-xs text-foreground">
                <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-brand" />
                {FEATURE_LABEL_KEYS[f] ? t(FEATURE_LABEL_KEYS[f] as Parameters<typeof t>[0]) : f}
              </li>
            ))
          )}
        </ul>

        {pendingMessage ? (
          <p className="rounded-lg bg-brand/10 px-3 py-2 text-center text-[10px] text-brand leading-relaxed">
            {pendingMessage}
          </p>
        ) : (
          <button
            onClick={handleSelectClick}
            disabled={isCurrent || loading}
            className={cn(
              'w-full rounded-lg py-2 text-xs font-semibold transition-colors',
              isCurrent
                ? 'cursor-default bg-brand/10 text-brand'
                : 'bg-brand text-white hover:bg-brand/90 active:scale-[0.98] disabled:opacity-60',
              loading && 'opacity-60 cursor-wait',
            )}
          >
            {isCurrent ? t('currentPlan') : loading ? t('selecting') : t('selectPlan')}
          </button>
        )}
      </div>
    </>
  );
}
