'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import type { Value as PhoneValue } from 'react-phone-number-input';
import { cn } from '@/lib/utils';
import { CardIcon, CashIcon, MobileMoneyIcon } from '@/features/auth/components/AuthIcons';
import { PAYMENT_METHODS } from '../consts/settings.consts';
import type { PaymentMethod } from '../interfaces/payment.interfaces';

const METHOD_ICON: Record<PaymentMethod, React.ComponentType<{ className?: string }>> = {
  stripe:       CardIcon,
  cash:         CashIcon,
  mobile_money: MobileMoneyIcon,
};

interface PaymentMethodModalProps {
  planName: string;
  planPrice: string;
  loading: boolean;
  onConfirm: (method: PaymentMethod, phone?: string) => Promise<void>;
  onClose: () => void;
}

export function PaymentMethodModal({
  planName,
  planPrice,
  loading,
  onConfirm,
  onClose,
}: PaymentMethodModalProps): React.JSX.Element {
  const t = useTranslations('settings.subscription');
  const [selected, setSelected] = useState<PaymentMethod>('stripe');
  const [phone, setPhone] = useState('');

  const phoneValid = phone ? isValidPhoneNumber(phone) : false;

  function handlePhoneChange(value: PhoneValue | undefined): void {
    setPhone(value ?? '');
  }
  const confirmDisabled = loading || (selected === 'mobile_money' && !phoneValid);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl space-y-5">
        <div>
          <p className="text-sm font-bold text-foreground">{t('paymentMethod.title')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {planName} — {planPrice}
          </p>
        </div>

        <div className="space-y-2">
          {PAYMENT_METHODS.map((method) => {
            const Icon = METHOD_ICON[method.id];
            const isSelected = selected === method.id;
            return (
              <button
                key={method.id}
                onClick={() => setSelected(method.id)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                  isSelected
                    ? 'border-brand bg-brand/5'
                    : 'border-border hover:border-brand/40',
                )}
              >
                <Icon className={cn('h-5 w-5 shrink-0', isSelected ? 'text-brand' : 'text-muted-foreground')} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{t(method.labelKey)}</p>
                  <p className="text-[10px] text-muted-foreground">{t(method.descKey)}</p>
                </div>
                <div
                  className={cn(
                    'h-4 w-4 rounded-full border-2 shrink-0 transition-colors',
                    isSelected ? 'border-brand bg-brand' : 'border-muted-foreground/40',
                  )}
                />
              </button>
            );
          })}
        </div>

        {selected === 'mobile_money' && (
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              {t('paymentMethod.phoneNumber')}
            </label>
            <PhoneInput
              international
              defaultCountry="MG"
              {...(phone ? { value: phone as PhoneValue } : {})}
              onChange={handlePhoneChange}
              placeholder="+261 34 00 000 00"
              aria-label={t('paymentMethod.phoneNumber')}
            />
            {phone && !phoneValid && (
              <p className="mt-1 text-[10px] text-destructive">{t('paymentMethod.phoneInvalid')}</p>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold text-muted-foreground hover:border-brand/40 transition-colors disabled:opacity-60"
          >
            {t('paymentMethod.cancel')}
          </button>
          <button
            onClick={() => void onConfirm(selected, selected === 'mobile_money' ? phone : undefined)}
            disabled={confirmDisabled}
            className={cn(
              'flex-1 rounded-lg py-2 text-xs font-semibold text-white transition-colors',
              confirmDisabled ? 'bg-brand/60 cursor-not-allowed' : 'bg-brand hover:bg-brand/90 active:scale-[0.98]',
            )}
          >
            {loading ? t('paymentMethod.confirming') : t('paymentMethod.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
