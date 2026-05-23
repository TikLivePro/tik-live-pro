'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUpdatePassword } from '../hooks/useUpdatePassword';
import { cn } from '@/lib/utils';
import { EyeIcon, EyeOffIcon } from '@/features/auth/components/AuthIcons';

export function SecuritySection(): React.JSX.Element {
  const t = useTranslations('settings');
  const [showForm, setShowForm] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const { mutate: updatePassword, isPending, reset } = useUpdatePassword();

  function handleCancel() {
    setShowForm(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setValidationError(null);
    reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setValidationError(t('security.passwordMismatch'));
      return;
    }
    setValidationError(null);
    updatePassword(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setShowForm(false);
          reset();
        },
      },
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t('security.sectionTitle')}
      </p>

      <div className="divide-y divide-border">
        {/* Password row */}
        <div className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('security.password')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('security.passwordChangedDaysAgo', { days: 30 })}
              </p>
            </div>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                {t('security.changePassword')}
              </button>
            )}
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <PasswordField
                id="current-password"
                label={t('security.currentPassword')}
                value={currentPassword}
                onChange={setCurrentPassword}
                show={showCurrent}
                onToggleShow={() => setShowCurrent((v) => !v)}
              />
              <PasswordField
                id="new-password"
                label={t('security.newPassword')}
                value={newPassword}
                onChange={setNewPassword}
                show={showNew}
                onToggleShow={() => setShowNew((v) => !v)}
              />
              <PasswordField
                id="confirm-password"
                label={t('security.confirmNewPassword')}
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showNew}
                onToggleShow={() => setShowNew((v) => !v)}
              />

              {validationError && (
                <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {validationError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  {t('security.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className={cn(
                    'rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white',
                    'hover:bg-brand/90 transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {isPending ? t('security.changePasswordTitle') + '...' : t('security.changePasswordTitle')}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* 2FA row */}
        <div className="flex items-center justify-between pt-3">
          <div>
            <p className="text-sm font-medium">{t('security.twoFactor')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('security.twoFactorNotConfigured')}</p>
          </div>
          <button
            disabled
            className="cursor-not-allowed rounded-lg border border-border px-4 py-1.5 text-sm font-medium opacity-50"
          >
            {t('security.twoFactorEnable')}
          </button>
        </div>
      </div>
    </section>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
}

function PasswordField({ id, label, value, onChange, show, onToggleShow }: PasswordFieldProps): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full rounded-lg border border-border bg-input px-3 py-2 pr-10 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/60 transition-colors',
          )}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
