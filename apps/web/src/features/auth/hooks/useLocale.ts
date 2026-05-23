'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale as useNextIntlLocale } from 'next-intl';
import { supportedLocales, type SupportedLocale } from '@tik-live-pro/i18n';

export { type SupportedLocale };

export function setLocaleCookie(locale: SupportedLocale): void {
  document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

export function useLocale() {
  const locale = useNextIntlLocale() as SupportedLocale;
  const router = useRouter();

  const setLocale = useCallback(
    (next: SupportedLocale) => {
      setLocaleCookie(next);
      router.refresh();
    },
    [router],
  );

  return { locale, setLocale, supportedLocales };
}
