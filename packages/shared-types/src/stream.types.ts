import type { SocialAccountId, PlatformStreamDestination } from './social.types.js';
import type { UserId } from './user.types.js';

export type LiveSessionId = string & { readonly _brand: 'LiveSessionId' };

export const LiveSessionStatus = {
  CREATED: 'created',
  STARTING: 'starting',
  LIVE: 'live',
  PAUSED: 'paused',
  ENDING: 'ending',
  ENDED: 'ended',
  ERROR: 'error',
} as const;
export type LiveSessionStatus = (typeof LiveSessionStatus)[keyof typeof LiveSessionStatus];

export interface LiveSession {
  id: LiveSessionId;
  userId: UserId;
  title: string;
  description: string | null;
  status: LiveSessionStatus;
  destinations: PlatformStreamDestination[];
  shouldRecord: boolean;
  platformHlsUrl: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}

export interface StreamHealth {
  sessionId: LiveSessionId;
  destinationId: SocialAccountId;
  bitrate: number;
  fps: number;
  droppedFrames: number;
  latencyMs: number;
  checkedAt: Date;
}
