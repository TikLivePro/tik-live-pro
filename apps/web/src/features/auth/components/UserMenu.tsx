'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useProfile } from '../hooks/useProfile';
import { useLocale } from '../hooks/useLocale';
import { getInitials } from '@/lib/text.utils';
import { cn } from '@/lib/utils';
import { SettingsGearIcon, LogOutIcon, ChevronDownIcon, SunIcon, MoonIcon, GlobeIcon, BroadcastIcon } from './AuthIcons';
import { AVATAR_COLORS } from '@/lib/avatar.consts';

interface UserMenuProps {
  showDashboardLink?: boolean;
}

export function UserMenu({ showDashboardLink = false }: UserMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const t = useTranslations('auth');
  const tSettings = useTranslations('settings');
  const tLandingNav = useTranslations('landing.nav');
  const { displayName, email, avatarUrl, subscriptionTier } = useProfile();
  const { locale, setLocale } = useLocale();

  const label = displayName ?? email ?? 'User';
  const initials = getInitials(label);
  const avatarColor = AVATAR_COLORS[0];
  const otherLocale = locale === 'en' ? 'fr' : 'en';
  const otherLocaleLabel = locale === 'en' ? 'Français' : 'English';

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
          'hover:bg-muted',
          open && 'bg-muted',
        )}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={label}
            referrerPolicy="no-referrer"
            className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', avatarColor)}>
            {initials}
          </div>
        )}
        <div className="hidden flex-col items-start sm:flex">
          <span className="max-w-[120px] truncate text-sm font-semibold leading-tight">{label}</span>
          {subscriptionTier && (
            <span className="text-[10px] font-medium capitalize text-muted-foreground">{subscriptionTier}</span>
          )}
        </div>
        <ChevronDownIcon className={cn('h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="animate-scale-in absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl shadow-black/10 dark:shadow-black/40">
          {/* User info header */}
          <div className="border-b border-border bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={label}
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white', avatarColor)}>
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{displayName ?? t('user')}</p>
                {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
              </div>
            </div>
            {subscriptionTier && (
              <span className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-brand/25 bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2l2.9 6.26L21.5 9.27l-4.75 4.63L17.8 20.5 12 17.27 6.2 20.5l1.05-6.6L2.5 9.27l6.6-1.01L12 2z" />
                </svg>
                {subscriptionTier}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="py-1.5">
            {showDashboardLink && (
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <BroadcastIcon className="h-4 w-4 flex-shrink-0 text-brand" />
                <span className="text-brand">{tLandingNav('goToDashboard')}</span>
              </Link>
            )}
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted"
            >
              <SettingsGearIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              {tSettings('title')}
            </Link>

            <button
              type="button"
              onClick={() => { toggle(); setOpen(false); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted"
            >
              {theme === 'dark'
                ? <SunIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                : <MoonIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
              {theme === 'dark' ? t('themeLight') : t('themeDark')}
            </button>

            <button
              type="button"
              onClick={() => { setLocale(otherLocale); setOpen(false); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted"
            >
              <GlobeIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span className="flex-1 text-left">{t('language')}</span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                {otherLocaleLabel}
              </span>
            </button>
          </div>

          <div className="border-t border-border py-1.5">
            <button
              type="button"
              onClick={() => { logout(); setOpen(false); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/5"
            >
              <LogOutIcon className="h-4 w-4 flex-shrink-0" />
              {t('signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
