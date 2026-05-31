import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type {
  DestinationStatusChangedPayload,
  StreamHealthUpdatedPayload,
  SessionStatusChangedPayload,
} from '@tik-live-pro/events';
import type {
  LiveSessionId,
  UserId,
  SocialAccountId,
  SocialPlatform,
  DestinationStatus,
} from '@tik-live-pro/shared-types';
import { LiveSessionStatus } from '@tik-live-pro/shared-types';
import type { StreamWorkerStats } from '../../application/ports/stream-worker.port.js';

export class StreamEventPublisher {
  constructor(private readonly nats: NatsJetStreamClient) {}

  async destinationStatusChanged(
    sessionId: LiveSessionId,
    socialAccountId: SocialAccountId,
    platform: SocialPlatform,
    previousStatus: DestinationStatus,
    status: DestinationStatus,
    errorMessage: string | null,
    correlationId: string,
  ): Promise<void> {
    const base = { sessionId, socialAccountId, platform, previousStatus, status };
    const payload: DestinationStatusChangedPayload =
      errorMessage !== null ? { ...base, errorMessage } : base;

    await this.nats.publish(Subjects.STREAM_DESTINATION_STATUS_CHANGED, payload, { correlationId });
  }

  async sessionLive(
    sessionId: LiveSessionId,
    userId: UserId,
    hlsUrl: string,
    correlationId: string,
  ): Promise<void> {
    const payload: SessionStatusChangedPayload = {
      sessionId,
      userId,
      previousStatus: LiveSessionStatus.STARTING,
      status: LiveSessionStatus.LIVE,
      occurredAt: new Date().toISOString(),
      hlsUrl,
    };
    await this.nats.publish(Subjects.SESSION_LIVE, payload, { correlationId });
  }

  async sessionBroadcastStopped(
    sessionId: LiveSessionId,
    userId: UserId,
    correlationId: string,
  ): Promise<void> {
    const payload: SessionStatusChangedPayload = {
      sessionId,
      userId,
      previousStatus: LiveSessionStatus.ENDING,
      status: LiveSessionStatus.ENDED,
      occurredAt: new Date().toISOString(),
    };

    console.log('payload :>> ', JSON.stringify(payload, null, 2));

    await this.nats.publish(Subjects.SESSION_BROADCAST_STOPPED, payload, { correlationId });
  }

  async sessionError(
    sessionId: LiveSessionId,
    userId: UserId,
    correlationId: string,
  ): Promise<void> {
    const payload: SessionStatusChangedPayload = {
      sessionId,
      userId,
      previousStatus: LiveSessionStatus.STARTING,
      status: LiveSessionStatus.ERROR,
      occurredAt: new Date().toISOString(),
    };
    await this.nats.publish(Subjects.SESSION_ERROR, payload, { correlationId });
  }

  async healthUpdated(
    sessionId: LiveSessionId,
    socialAccountId: SocialAccountId,
    stats: StreamWorkerStats,
    correlationId: string,
  ): Promise<void> {
    const payload: StreamHealthUpdatedPayload = {
      sessionId,
      destinationId: socialAccountId,
      bitrate: stats.bitrate,
      fps: stats.fps,
      droppedFrames: 0,
      latencyMs: 0,
      checkedAt: new Date(),
    };
    await this.nats.publish(Subjects.STREAM_HEALTH_UPDATED, payload, { correlationId });
  }
}
