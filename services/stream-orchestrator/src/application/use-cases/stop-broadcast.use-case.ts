import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';
import type { ITokenProvider } from '../ports/token-provider.port.js';
import type { AdapterRegistry } from '@tik-live-pro/platform-adapters';
import type { StreamEventPublisher } from '../../infrastructure/nats/stream-event-publisher.js';
import type { HandleStreamArrivedUseCase } from './handle-stream-arrived.use-case.js';
import type { LiveSessionId } from '@tik-live-pro/shared-types';
import { DestinationStatus, SocialPlatform as SP } from '@tik-live-pro/shared-types';
import { StreamSessionStatus } from '../../domain/entities/stream-session.entity.js';
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

    // Stop the ffmpeg worker first
    if (session.ingestKey) {
      await this.streamArrivalHandler.stopWorker(session.ingestKey);
    }

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
}
