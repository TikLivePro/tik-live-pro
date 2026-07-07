'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from '../hooks/useTheme';
import { SunIcon, MoonIcon } from './AuthIcons';

export function ThemeToggleButton(): React.ReactElement {
  const { theme, toggle } = useTheme();
  const t = useTranslations('auth');
  const label = theme === 'dark' ? t('themeLight') : t('themeDark');

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </button>
  );
}
