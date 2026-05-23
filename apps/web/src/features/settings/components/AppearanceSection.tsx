'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from '@/features/auth/hooks/useTheme';
import { SunIcon, MoonIcon } from '@/features/auth/components/AuthIcons';
import { cn } from '@/lib/utils';

export function AppearanceSection(): React.JSX.Element {
  const t = useTranslations('settings');
  const { theme, toggle } = useTheme();

  const isDark = theme === 'dark';

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t('appearance.sectionTitle')}
      </p>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t('appearance.theme')}</p>
          <p className="text-xs text-muted-foreground">
            {isDark ? t('appearance.currentDark') : t('appearance.currentLight')}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
          <button
            onClick={() => !isDark || toggle()}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              !isDark ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <SunIcon className="h-3.5 w-3.5" />
            {t('appearance.themeLight')}
          </button>
          <button
            onClick={() => isDark || toggle()}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              isDark ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <MoonIcon className="h-3.5 w-3.5" />
            {t('appearance.themeDark')}
          </button>
        </div>
      </div>
    </section>
  );
}
