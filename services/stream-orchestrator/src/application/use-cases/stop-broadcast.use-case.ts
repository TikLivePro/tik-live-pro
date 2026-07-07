import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';
import type { ITokenProvider } from '../ports/token-provider.port.js';
import type { AdapterRegistry } from '@tik-live-pro/platform-adapters';
import type { StreamEventPublisher } from '../../infrastructure/nats/stream-event-publisher.js';
import type { HandleStreamArrivedUseCase } from './handle-stream-arrived.use-case.js';
import type { LiveSessionId } from '@tik-live-pro/shared-types';
import { DestinationStatus, SocialPlatform as SP } from '@tik-live-pro/shared-types';
import { StreamSessionStatus } from '../../domain/entities/stream-session.entity.js';
import { stopVideoPush } from '../../infrastructure/ffmpeg/video-push-registry.js';
import type { Logger } from '@tik-live-pro/logger';

export interface StopBroadcastInput {
  sessionId: LiveSessionId;
  correlationId: string;
}

export class StopBroadcastUseCase {
  constructor(
    private readonly sessionRepo: IStreamSessionRepository,
    private readonly tokenProvider: ITokenProvider,
    private readonly adapterRegistry: AdapterRegistry,
    private readonly streamArrivalHandler: HandleStreamArrivedUseCase,
    private readonly eventPublisher: StreamEventPublisher,
    private readonly logger: Logger,
    private readonly mediaMtxApiUrl: string,
    private readonly mediaMtxApiAuthHeader: string | undefined,
  ) {}

  async execute(input: StopBroadcastInput): Promise<void> {
    const session = await this.sessionRepo.findBySessionId(input.sessionId);
    if (!session) {
      this.logger.warn({ sessionId: input.sessionId }, 'Session not found for stop, ignoring');
      return;
    }

    if (
      session.status === StreamSessionStatus.ENDED ||
      session.status === StreamSessionStatus.ERROR ||
      session.status === StreamSessionStatus.IDLE
    ) {
      this.logger.info({ sessionId: input.sessionId, status: session.status }, 'Session already stopped — notifying live-session to finalize');
      await this.eventPublisher.sessionBroadcastStopped(session.sessionId, session.userId, input.correlationId);
      return;
    }

    // Kill any looping video-push ffmpeg first: it would otherwise keep the
    // MediaMTX path (and ~1 CPU core of libx264) alive forever after the
    // session ends, since nothing else knows about it.
    if (stopVideoPush(session.sessionId)) {
      this.logger.info({ sessionId: session.sessionId }, 'Stopped video-push process on session end');
    }

    // Stop the ffmpeg worker and any active recording
    if (session.ingestKey) {
      await this.streamArrivalHandler.stopWorker(session.ingestKey);
      await this.stopMediaMtxRecording(session.ingestKey);
    }
    // Finalize: if the user was recording, move to STOPPED so the uploader uploads the files.
    // If the user never started recording (NONE), leave the status as-is — no upload should happen.
    session.finalizeRecording();

    session.beginEnding();

    const activeDests = session.destinations.filter(
      (d) =>
        d.status === DestinationStatus.LIVE || d.status === DestinationStatus.CONNECTING,
    );

    // Capture statuses before mutation
    const previousStatuses = activeDests.map((d) => d.status);

    // End live streams on social platform destinations only (skip internal MediaMTX dest), best-effort
    await Promise.allSettled(
      activeDests.filter((d) => d.platform !== SP.PLATFORM).map(async (dest) => {
        try {
          const { accessToken } = await this.tokenProvider.getToken(dest.socialAccountId);
          const adapter = this.adapterRegistry.get(dest.platform);
          const streamId = dest.platformStreamId ?? dest.streamTarget?.streamKey ?? '';
          await adapter.endLiveStream(accessToken, streamId);
        } catch (err) {
          this.logger.warn({ err, accountId: dest.socialAccountId }, 'Failed to end live stream on platform');
        }
      }),
    );

    session.markAllDestinationsEnded();

    for (let i = 0; i < activeDests.length; i++) {
      const dest = activeDests[i];
      const prevStatus = previousStatuses[i];
      if (!dest || !prevStatus) continue;
      await this.eventPublisher.destinationStatusChanged(
        session.sessionId,
        dest.socialAccountId,
        dest.platform,
        prevStatus,
        DestinationStatus.ENDED,
        null,
        input.correlationId,
      );
    }

    session.markEnded();
    await this.sessionRepo.update(session);

    await this.eventPublisher.sessionBroadcastStopped(
      session.sessionId,
      session.userId,
      input.correlationId,
    );

    this.logger.info({ sessionId: input.sessionId }, 'Broadcast stopped');
  }

  private async stopMediaMtxRecording(ingestKey: string): Promise<void> {
    const pathName = encodeURIComponent(`live/${ingestKey}`);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.mediaMtxApiAuthHeader) headers['Authorization'] = this.mediaMtxApiAuthHeader;
    try {
      // PATCH record:false triggers immediate .mp4.part → .mp4 finalization.
      // DELETE would remove the config but not guarantee the file is flushed before disconnect.
      const res = await fetch(`${this.mediaMtxApiUrl}/v3/config/paths/patch/${pathName}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ record: false }),
      });
      if (!res.ok && res.status !== 404) {
        this.logger.warn({ ingestKey, status: res.status }, 'Failed to stop MediaMTX recording on session end');
      }
    } catch (err) {
      this.logger.warn({ err, ingestKey }, 'Failed to stop MediaMTX recording on session end');
    }
  }
}
