import type { BaseEvent } from '@tik-live-pro/shared-types';
import type { UserId, SubscriptionTier, Entitlement, SubscriptionStatus } from '@tik-live-pro/shared-types';

export interface SubscriptionCreatedPayload {
  userId: UserId;
  tier: SubscriptionTier;
  stripeSubscriptionId: string;
  currentPeriodEnd: string;
}

export type SubscriptionCreatedEvent = BaseEvent<SubscriptionCreatedPayload>;

export interface EntitlementUpdatedPayload {
  userId: UserId;
  entitlement: Entitlement;
}

export type EntitlementUpdatedEvent = BaseEvent<EntitlementUpdatedPayload>;

export interface PaymentFailedPayload {
  userId: UserId;
  stripeSubscriptionId: string;
  reason: string;
  nextRetryAt: string | null;
}

export type PaymentFailedEvent = BaseEvent<PaymentFailedPayload>;

export interface SubscriptionStatusChangedPayload {
  userId: UserId;
  tier: SubscriptionTier;
  previousStatus: SubscriptionStatus;
  status: SubscriptionStatus;
}

export type SubscriptionStatusChangedEvent = BaseEvent<SubscriptionStatusChangedPayload>;
