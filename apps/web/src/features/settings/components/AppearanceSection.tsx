'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme, type ThemePreference } from '@/features/auth/hooks/useTheme';
import { useLocale, setLocaleCookie, type SupportedLocale } from '@/features/auth/hooks/useLocale';
import { useUpdateProfile } from '../hooks/useUpdateProfile';
import { ThemePreviewCard } from './ThemePreviewCard';

const THEME_MODES: ThemePreference[] = ['dark', 'light', 'system'];

const LOCALES: { value: SupportedLocale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
];

export function AppearanceSection(): React.JSX.Element {
  const t = useTranslations('settings.appearance');
  const { preference, setPreference } = useTheme();
  const { locale: currentLocale } = useLocale();
  const router = useRouter();
  const { mutate: updateProfile } = useUpdateProfile();

  function handleLocaleChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const next = e.target.value as SupportedLocale;
    if (next === currentLocale) return;
    setLocaleCookie(next);
    // Persist server-side too so other devices pick it up.
    updateProfile({ locale: next });
    router.refresh();
  }

  const themeLabels: Record<ThemePreference, string> = {
    dark: t('themeDark'),
    light: t('themeLight'),
    system: t('themeSystem'),
  };

  return (
    <section className="space-y-4">
      <h3 className="text-display text-lg font-bold">{t('title')}</h3>

      <div className="card-surface space-y-3 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t('theme')}
        </p>
        <div role="radiogroup" aria-label={t('theme')} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEME_MODES.map((mode) => (
            <ThemePreviewCard
              key={mode}
              mode={mode}
              label={themeLabels[mode]}
              active={preference === mode}
              onSelect={() => setPreference(mode)}
            />
          ))}
        </div>
      </div>

      <div className="card-surface space-y-3 p-5">
        <label
          htmlFor="settings-language"
          className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          {t('language')}
        </label>
        <select
          id="settings-language"
          value={currentLocale}
          onChange={handleLocaleChange}
          className="w-full max-w-xs rounded-xl border border-[var(--input-border-color)] bg-input px-3.5 py-2.5 text-sm transition-colors"
        >
          {LOCALES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
