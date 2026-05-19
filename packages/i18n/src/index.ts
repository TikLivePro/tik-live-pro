export const supportedLocales = ['en', 'fr'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export const defaultLocale: SupportedLocale = 'en';

export function isSupported(locale: string): locale is SupportedLocale {
  return (supportedLocales as readonly string[]).includes(locale);
}
