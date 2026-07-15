'use client';

import { useTranslations } from 'next-intl';
import { PAYMENT_METHODS } from '../consts/settings.consts';

/**
 * Payment methods accepted at checkout. There is no saved-payment-method API,
 * so this lists the available options rather than a stored card.
 */
export function PaymentMethodsRow(): React.ReactElement {
  const t = useTranslations('settings.subscription');

  return (
    <div className="card-surface space-y-3 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t('paymentMethodsTitle')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t('paymentMethodsSubtitle')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {PAYMENT_METHODS.map((method) => (
          <span
            key={method.id}
            className="bg-surface-2 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold"
          >
            <svg
              className="h-3.5 w-3.5 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="1" y="4" width="22" height="16" rx="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            {t(method.labelKey as Parameters<typeof t>[0])}
          </span>
        ))}
      </div>
    </div>
  );
}
