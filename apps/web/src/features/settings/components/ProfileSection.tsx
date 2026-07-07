'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/features/auth/hooks/useProfile';
import { useLocale, setLocaleCookie, type SupportedLocale } from '@/features/auth/hooks/useLocale';
import { useUpdateProfile } from '../hooks/useUpdateProfile';
import { getInitials } from '@/lib/text.utils';
import { AVATAR_COLORS } from '@/lib/avatar.consts';
import { cn } from '@/lib/utils';

const LOCALES: { value: SupportedLocale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
];

export function ProfileSection(): React.JSX.Element {
  const t = useTranslations('settings');
  const { displayName, email, avatarUrl } = useProfile();
  const { locale: currentLocale } = useLocale();
  const router = useRouter();
  const { mutate: updateProfile, isPending } = useUpdateProfile();

  const [name, setName] = useState(displayName ?? '');
  const [locale, setLocale] = useState<SupportedLocale>(currentLocale);

  useEffect(() => {
    if (displayName) setName(displayName);
  }, [displayName]);

  // Sync locale selector with the current applied locale
  useEffect(() => {
    setLocale(currentLocale);
  }, [currentLocale]);

  function handleLocaleChange() {
    if (locale !== currentLocale) {
      setLocaleCookie(locale);
      router.refresh();
    }
  }

  const initials = getInitials(name || displayName || email || 'U');
  const avatarColor = AVATAR_COLORS[0];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateProfile({ displayName: name, locale }, { onSuccess: handleLocaleChange });
  }

  return (
    <section className="card-surface space-y-4 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t('profile.sectionTitle')}
      </p>

      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={displayName ?? ''}
            referrerPolicy="no-referrer"
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white', avatarColor)}>
            {initials}
          </div>
        )}
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
            onChange={(e) => setLocale(e.target.value as SupportedLocale)}
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
          <button
            type="submit"
            disabled={isPending}
            className={cn(
              'bg-gradient-brand shadow-brand-glow rounded-lg px-4 py-2 text-sm font-semibold text-white',
              'transition-all hover:brightness-110 active:scale-[0.98]',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
            )}
          >
            {isPending ? t('profile.saving') : t('profile.save')}
          </button>
        </div>
      </form>
    </section>
  );
}
