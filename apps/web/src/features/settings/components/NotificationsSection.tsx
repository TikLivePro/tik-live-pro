'use client';

import { useTranslations } from 'next-intl';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { cn } from '@/lib/utils';

interface ToggleRowProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

function ToggleRow({ label, description, enabled, onToggle }: ToggleRowProps): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={cn(
          'relative mt-0.5 h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200',
          enabled ? 'bg-brand' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
            enabled ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export function NotificationsSection(): React.JSX.Element {
  const t = useTranslations('settings');
  const { streamStarted, streamEnded, accountConnected, paymentFailed, toggle } = useNotificationPreferences();

  const rows = [
    { key: 'streamStarted' as const, enabled: streamStarted },
    { key: 'streamEnded' as const, enabled: streamEnded },
    { key: 'accountConnected' as const, enabled: accountConnected },
    { key: 'paymentFailed' as const, enabled: paymentFailed },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t('notifications.sectionTitle')}
      </p>
      <div className="divide-y divide-border">
        {rows.map(({ key, enabled }) => (
          <ToggleRow
            key={key}
            label={t(`notifications.${key}`)}
            description={t(`notifications.${key}Desc`)}
            enabled={enabled}
            onToggle={() => toggle(key)}
          />
        ))}
      </div>
    </section>
  );
}
