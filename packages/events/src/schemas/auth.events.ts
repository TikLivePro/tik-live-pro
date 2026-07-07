import type { BaseEvent } from '@tik-live-pro/shared-types';
import type { UserId, Email, SubscriptionTier } from '@tik-live-pro/shared-types';

export interface UserRegisteredPayload {
  userId: UserId;
  email: Email;
  displayName: string;
  /** Profile picture from the OAuth provider, when the user registered via OAuth. */
  avatarUrl?: string | null;
  subscriptionTier: SubscriptionTier;
  locale: string;
}

export type UserRegisteredEvent = BaseEvent<UserRegisteredPayload>;

export interface UserLoggedInPayload {
  userId: UserId;
  email: Email;
  ipAddress: string;
  userAgent: string;
}

export type UserLoggedInEvent = BaseEvent<UserLoggedInPayload>;
