'use client';

import { useTranslations } from 'next-intl';

export function SecuritySection() {
  const t = useTranslations('settings');

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {t('security.sectionTitle')}
      </p>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t('security.password')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('security.passwordChangedDaysAgo', { days: 30 })}
          </p>
        </div>
        <button className="text-sm font-medium border border-border rounded-lg px-4 py-1.5 hover:bg-muted transition-colors">
          {t('security.changePassword')}
        </button>
      </div>
    </section>
  );
}
