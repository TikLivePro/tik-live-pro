import type { UserId, SubscriptionTier } from './user.types.js';

export type SubscriptionId = string & { readonly _brand: 'SubscriptionId' };

export const SubscriptionStatus = {
  ACTIVE: 'active',
  CANCELED: 'canceled',
  PAST_DUE: 'past_due',
  TRIALING: 'trialing',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export interface Subscription {
  id: SubscriptionId;
  userId: UserId;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  canceledAt: Date | null;
}

export const Feature = {
  UNLIMITED_ACCOUNTS: 'unlimited_accounts',
  ANALYTICS_DASHBOARD: 'analytics_dashboard',
  COMMENT_MODERATION: 'comment_moderation',
  STREAM_RECORDING: 'stream_recording',
} as const;
export type Feature = (typeof Feature)[keyof typeof Feature];

export interface Entitlement {
  userId: UserId;
  tier: SubscriptionTier;
  features: Feature[];
  maxSocialAccounts: number;
}
