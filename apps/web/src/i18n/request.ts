import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, isSupported } from '@tik-live-pro/i18n';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('locale')?.value;
  const locale = localeCookie && isSupported(localeCookie) ? localeCookie : defaultLocale;

  return {
    locale,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: (await import(`@tik-live-pro/i18n/locales/${locale}.json`)).default as any,
  };
});
