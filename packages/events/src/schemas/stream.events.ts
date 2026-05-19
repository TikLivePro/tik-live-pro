import type { BaseEvent } from '@tik-live-pro/shared-types';
import type { LiveSessionId, LiveSessionStatus, StreamHealth } from '@tik-live-pro/shared-types';
import type { UserId } from '@tik-live-pro/shared-types';
import type { SocialAccountId, SocialPlatform, DestinationStatus } from '@tik-live-pro/shared-types';

export interface SessionCreatedPayload {
  sessionId: LiveSessionId;
  userId: UserId;
  title: string;
  description: string | null;
  destinationAccountIds: SocialAccountId[];
}

export type SessionCreatedEvent = BaseEvent<SessionCreatedPayload>;

export interface SessionStatusChangedPayload {
  sessionId: LiveSessionId;
  userId: UserId;
  previousStatus: LiveSessionStatus;
  status: LiveSessionStatus;
  occurredAt: string;
}

export type SessionStatusChangedEvent = BaseEvent<SessionStatusChangedPayload>;

export interface DestinationStatusChangedPayload {
  sessionId: LiveSessionId;
  socialAccountId: SocialAccountId;
  platform: SocialPlatform;
  previousStatus: DestinationStatus;
  status: DestinationStatus;
  errorMessage?: string;
}

export type DestinationStatusChangedEvent = BaseEvent<DestinationStatusChangedPayload>;

export type StreamHealthUpdatedPayload = StreamHealth;
export type StreamHealthUpdatedEvent = BaseEvent<StreamHealthUpdatedPayload>;
