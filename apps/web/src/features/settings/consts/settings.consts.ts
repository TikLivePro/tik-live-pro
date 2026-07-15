export { AVATAR_COLORS } from '@/lib/avatar.consts';

import type { Feature } from '@tik-live-pro/shared-types';
import type { PaymentMethodOption } from '../interfaces/payment.interfaces';

/** Maps a billing `Feature` slug to its i18n label key under `settings.subscription.features`. */
export const FEATURE_LABEL_KEYS: Record<Feature, string> = {
  unlimited_accounts: 'features.unlimitedAccounts',
  analytics_dashboard: 'features.analytics',
  comment_moderation: 'features.moderation',
  stream_recording: 'features.recording',
  priority_support: 'features.prioritySupport',
};

/** Cosmetic yearly-billing discount shown on the upgrade paywall (display only — checkout is monthly). */
export const UPGRADE_YEARLY_DISCOUNT = 0.2;

export const PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: 'stripe',       labelKey: 'paymentMethod.card',        descKey: 'paymentMethod.cardDesc' },
  { id: 'cash',         labelKey: 'paymentMethod.cash',        descKey: 'paymentMethod.cashDesc' },
  { id: 'mobile_money', labelKey: 'paymentMethod.mobileMoney', descKey: 'paymentMethod.mobileMoneyDesc' },
];

/** Section ids of the settings tab nav. Each id doubles as the URL hash (#subscription, …). */
export const SETTINGS_SECTION_IDS = [
  'profile',
  'subscription',
  'notifications',
  'appearance',
  'security',
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'profile';

/** Avatar upload constraints — mirrors POST /users/me/avatar (users service). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';
