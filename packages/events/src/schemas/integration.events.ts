import type { BaseEvent } from '@tik-live-pro/shared-types';
import type { SocialPlatform, SocialAccountId, UserId } from '@tik-live-pro/shared-types';

export interface IntegrationAccountDisconnectedPayload {
  socialAccountId: SocialAccountId;
  userId: UserId;
  platform: SocialPlatform;
  platformUserId: string;
  reason: 'user_initiated' | 'token_expired' | 'platform_revoked';
}

export type IntegrationAccountDisconnectedEvent = BaseEvent<IntegrationAccountDisconnectedPayload>;

export interface IntegrationPlatformSessionEndedPayload {
  platform: SocialPlatform;
  platformUserId: string;
  socialAccountId: SocialAccountId;
}

export type IntegrationPlatformSessionEndedEvent = BaseEvent<IntegrationPlatformSessionEndedPayload>;
