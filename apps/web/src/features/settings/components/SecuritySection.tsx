'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUpdatePassword } from '../hooks/useUpdatePassword';
import { DeleteAccountModal } from './DeleteAccountModal';
import { PasswordField } from '@/features/auth/components/PasswordField';
import { cn } from '@/lib/utils';

function describeUserAgent(ua: string): string {
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /firefox\//i.test(ua)
      ? 'Firefox'
      : /chrome\//i.test(ua)
        ? 'Chrome'
        : /safari\//i.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /windows/i.test(ua)
    ? 'Windows'
    : /android/i.test(ua)
      ? 'Android'
      : /iphone|ipad|ios/i.test(ua)
        ? 'iOS'
        : /mac os/i.test(ua)
          ? 'macOS'
          : /linux/i.test(ua)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} · ${os}`;
}

export function SecuritySection(): React.JSX.Element {
  const t = useTranslations('settings');
  const [showForm, setShowForm] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('');

  const { mutate: updatePassword, isPending, reset } = useUpdatePassword();

  // navigator is unavailable during SSR — resolve the label client-side only.
  useEffect(() => {
    setDeviceLabel(describeUserAgent(navigator.userAgent));
  }, []);

  function handleCancel(): void {
    setShowForm(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setValidationError(null);
    reset();
  }

  function handleSubmit(e: React.FormEvent): void {
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
    <section className="space-y-4">
      <h3 className="text-display text-lg font-bold">{t('security.title')}</h3>

      {/* Password + 2FA */}
      <div className="card-surface space-y-3 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t('security.sectionTitle')}
        </p>

        <div className="divide-y divide-border">
          <div className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('security.password')}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('security.passwordHint')}
                </p>
              </div>
              {!showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="btn-ghost px-4 py-1.5 text-sm font-medium"
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
                  autoComplete="current-password"
                />
                <PasswordField
                  id="new-password"
                  label={t('security.newPassword')}
                  value={newPassword}
                  onChange={setNewPassword}
                  show={showNew}
                  onToggleShow={() => setShowNew((v) => !v)}
                  autoComplete="new-password"
                />
                <PasswordField
                  id="confirm-password"
                  label={t('security.confirmNewPassword')}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  show={showNew}
                  onToggleShow={() => setShowNew((v) => !v)}
                  autoComplete="new-password"
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
                    className="btn-ghost px-4 py-2 text-sm font-medium"
                  >
                    {t('security.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className={cn(
                      'btn-gradient px-4 py-2 text-sm font-semibold',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    {isPending
                      ? `${t('security.changePasswordTitle')}...`
                      : t('security.changePasswordTitle')}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="flex items-center justify-between pt-3">
            <div>
              <p className="text-sm font-medium">{t('security.twoFactor')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('security.twoFactorNotConfigured')}</p>
            </div>
            <button
              disabled
              className="cursor-not-allowed rounded-full border border-border px-4 py-1.5 text-sm font-medium opacity-50"
            >
              {t('security.twoFactorEnable')}
            </button>
          </div>
        </div>
      </div>

      {/* Active session — only the current device is known client-side */}
      <div className="card-surface space-y-3 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t('security.sessions.title')}
        </p>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <svg
              className="h-4.5 w-4.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{deviceLabel || '—'}</p>
            <p className="text-xs text-muted-foreground">{t('security.sessions.signedInNow')}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            {t('security.sessions.current')}
          </span>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-card border border-destructive/30 bg-destructive/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-destructive">
          {t('security.danger.title')}
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">{t('security.danger.deleteAccount')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('security.danger.description')}</p>
          </div>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="shrink-0 self-start rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 sm:self-auto"
          >
            {t('security.danger.deleteAccount')}
          </button>
        </div>
      </div>

      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </section>
  );
}
