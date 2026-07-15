'use client';

import { useTranslations } from 'next-intl';
import { useSocialAccounts } from '@/features/accounts/hooks/useSocialAccounts';
import { useMonthlyStats } from '@/features/stream/hooks/useMonthlyStats';
import type { Plan } from '@tik-live-pro/shared-types';

interface UsageMetersProps {
  plan: Plan | undefined;
}

/** Usage against the current plan: connected accounts quota + hours streamed this month. */
export function UsageMeters({ plan }: UsageMetersProps): React.ReactElement {
  const t = useTranslations('settings.subscription.usage');
  const { data: accounts } = useSocialAccounts();
  const { hoursLive } = useMonthlyStats();

  const accountCount = accounts?.length ?? 0;
  const maxAccounts = plan?.maxSocialAccounts ?? null;
  const accountsPct = maxAccounts
    ? Math.min(100, Math.round((accountCount / maxAccounts) * 100))
    : null;

  return (
    <div className="card-surface space-y-5 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t('title')}
      </p>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">{t('accounts')}</p>
          <p className="text-sm font-bold tabular-nums">
            {maxAccounts ? `${accountCount} / ${maxAccounts}` : t('unlimitedValue', { n: accountCount })}
          </p>
        </div>
        {accountsPct !== null && (
          <div
            role="progressbar"
            aria-valuenow={accountCount}
            aria-valuemin={0}
            aria-valuemax={maxAccounts ?? undefined}
            aria-label={t('accounts')}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="bg-gradient-brand h-full rounded-full transition-[width] duration-500"
              style={{ width: `${accountsPct}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2 border-t border-border/70 pt-4">
        <p className="text-sm font-medium">{t('hours')}</p>
        <p className="text-sm font-bold tabular-nums">{t('hoursValue', { n: hoursLive })}</p>
      </div>
    </div>
  );
}
