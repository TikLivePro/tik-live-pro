'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useProfile } from '@/features/auth/hooks/useProfile';
import { useUpdateProfile } from '../hooks/useUpdateProfile';
import { getInitials } from '@/lib/text.utils';
import { AVATAR_COLORS } from '@/lib/avatar.consts';
import { cn } from '@/lib/utils';

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
] as const;

export function ProfileSection(): React.JSX.Element {
  const t = useTranslations('settings');
  const { displayName, email } = useProfile();
  const { mutate: updateProfile, isPending, isSuccess, reset } = useUpdateProfile();

  const [name, setName] = useState(displayName ?? '');
  const [locale, setLocale] = useState('en');

  useEffect(() => {
    if (displayName) setName(displayName);
  }, [displayName]);

  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(reset, 2500);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, reset]);

  const initials = getInitials(name || displayName || email || 'U');
  const avatarColor = AVATAR_COLORS[0];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateProfile({ displayName: name, locale });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t('profile.sectionTitle')}
      </p>

      <div className="flex items-center gap-4">
        <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white', avatarColor)}>
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{displayName ?? t('profile.unnamed')}</p>
          {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('profile.displayName')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('profile.unnamed')}
            className={cn(
              'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/60 transition-colors',
            )}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('profile.email')}
          </label>
          <input
            type="email"
            value={email ?? ''}
            disabled
            className="w-full cursor-not-allowed rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('profile.language')}
          </label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className={cn(
              'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/60 transition-colors',
            )}
          >
            {LOCALES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          {isSuccess && (
            <span className="text-xs font-medium text-green-500">{t('profile.saved')}</span>
          )}
          <button
            type="submit"
            disabled={isPending}
            className={cn(
              'rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white',
              'hover:bg-brand/90 transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {isPending ? t('profile.saving') : t('profile.save')}
          </button>
        </div>
      </form>
    </section>
  );
}
