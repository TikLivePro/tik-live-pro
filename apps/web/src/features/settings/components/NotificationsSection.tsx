'use client';

import { useTranslations } from 'next-intl';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { NotificationToggleRow } from './NotificationToggleRow';

type PreferenceKey = 'streamStarted' | 'streamEnded' | 'accountConnected' | 'paymentFailed';

interface PreferenceGroup {
  titleKey: 'groupStream' | 'groupAccount';
  keys: PreferenceKey[];
}

const GROUPS: PreferenceGroup[] = [
  { titleKey: 'groupStream', keys: ['streamStarted', 'streamEnded'] },
  { titleKey: 'groupAccount', keys: ['accountConnected', 'paymentFailed'] },
];

export function NotificationsSection(): React.JSX.Element {
  const t = useTranslations('settings');
  const preferences = useNotificationPreferences();

  return (
    <section className="space-y-4">
      <h3 className="text-display text-lg font-bold">{t('notifications.title')}</h3>

      {GROUPS.map((group) => (
        <div key={group.titleKey} className="card-surface p-5">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t(`notifications.${group.titleKey}`)}
          </p>
          <div className="divide-y divide-border">
            {group.keys.map((key) => (
              <NotificationToggleRow
                key={key}
                label={t(`notifications.${key}`)}
                description={t(`notifications.${key}Desc`)}
                enabled={preferences[key]}
                onToggle={() => preferences.toggle(key)}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
