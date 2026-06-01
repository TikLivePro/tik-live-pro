import { randomUUID } from 'node:crypto';
import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';
import type { StreamWorkerFactory, IStreamWorker, StreamWorkerStats } from '../ports/stream-worker.port.js';
import type { StreamEventPublisher } from '../../infrastructure/nats/stream-event-publisher.js';
import { DestinationStatus, SocialPlatform as SP } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';

export class HandleStreamArrivedUseCase {
  private readonly workers = new Map<string, IStreamWorker>();

  constructor(
    private readonly sessionRepo: IStreamSessionRepository,
    private readonly eventPublisher: StreamEventPublisher,
    private readonly workerFactory: StreamWorkerFactory,
    private readonly mediaMtxRtmpBase: string,
    private readonly mediaMtxHlsUrl: string,
    private readonly logger: Logger,
  ) {}

  async execute(ingestKey: string): Promise<void> {
    if (this.workers.has(ingestKey)) {
      this.logger.warn({ ingestKey }, 'Worker already running for this ingest key');
      return;
    }

    const session = await this.sessionRepo.findByIngestKey(ingestKey);
    if (!session) {
      this.logger.warn({ ingestKey }, 'Unknown ingest key, ignoring');
      return;
    }

    // The stream is already in MediaMTX (browser pushed via WHIP or OBS via RTMP).
    // Mark the PLATFORM destination LIVE immediately — no ffmpeg relay needed for it.
    const platformDest = session.destinations.find(
      (d) => d.platform === SP.PLATFORM && d.status === DestinationStatus.CONNECTING,
    );
    if (platformDest) {
      session.markDestinationLive(platformDest.socialAccountId);
      await this.eventPublisher.destinationStatusChanged(
        session.sessionId,
        platformDest.socialAccountId,
        platformDest.platform,
        DestinationStatus.CONNECTING,
        DestinationStatus.LIVE,
        null,
        randomUUID(),
      );
    }

    // Social destinations that need ffmpeg to relay from MediaMTX → platform RTMP.
    const socialDests = session.destinations.filter(
      (d) => d.platform !== SP.PLATFORM && d.status === DestinationStatus.CONNECTING && d.rtmpDestination !== null,
    );

    if (socialDests.length === 0) {
      // No social accounts — go live immediately (HLS is already available from MediaMTX).
      session.markLive();
      const hlsUrl = `${this.mediaMtxHlsUrl}/live/${ingestKey}/index.m3u8`;
      await this.eventPublisher.sessionLive(session.sessionId, session.userId, hlsUrl, randomUUID());
      await this.sessionRepo.update(session);
      this.logger.info({ sessionId: session.sessionId }, 'Session live (platform-only, no social destinations)');
      return;
    }

    const worker = this.workerFactory();
    let firstStats = true;
    let lastHealthPublish = 0;

    worker.onStats((stats: StreamWorkerStats) => {
      void (async () => {
        if (firstStats) {
          firstStats = false;
          for (const dest of socialDests) {
            try {
              session.markDestinationLive(dest.socialAccountId);
              await this.eventPublisher.destinationStatusChanged(
                session.sessionId,
                dest.socialAccountId,
                dest.platform,
                DestinationStatus.CONNECTING,
                DestinationStatus.LIVE,
                null,
                randomUUID(),
              );
            } catch (err) {
              this.logger.error({ err, accountId: dest.socialAccountId }, 'Failed to mark destination live');
            }
          }

          if (session.hasAnyLiveDestination()) {
            session.markLive();
            const hlsUrl = `${this.mediaMtxHlsUrl}/live/${ingestKey}/index.m3u8`;
            await this.eventPublisher.sessionLive(session.sessionId, session.userId, hlsUrl, randomUUID());
            await this.sessionRepo.update(session);
          }
        }

        const now = Date.now();
        if (now - lastHealthPublish >= 5000) {
          lastHealthPublish = now;
          for (const dest of session.destinations) {
            if (dest.status === DestinationStatus.LIVE) {
              await this.eventPublisher.healthUpdated(
                session.sessionId,
                dest.socialAccountId,
                stats,
                randomUUID(),
              );
            }
          }
        }
      })();
    });

    worker.onError((err: Error) => {
      this.logger.error({ err, sessionId: session.sessionId }, 'Stream worker error');
      void (async () => {
        for (const dest of session.destinations) {
          if (
            dest.status === DestinationStatus.LIVE ||
            dest.status === DestinationStatus.CONNECTING
          ) {
            session.markDestinationError(dest.socialAccountId, err.message);
            await this.eventPublisher.destinationStatusChanged(
              session.sessionId,
              dest.socialAccountId,
              dest.platform,
              dest.status,
              DestinationStatus.ERROR,
              err.message,
              randomUUID(),
            );
          }
        }

        if (!session.hasAnyLiveDestination()) {
          session.markError();
          await this.eventPublisher.sessionError(session.sessionId, session.userId, randomUUID());
        }

        await this.sessionRepo.update(session);
        this.workers.delete(ingestKey);
      })();
    });

    this.workers.set(ingestKey, worker);

    const destConfigs = socialDests
      .filter((d): d is (typeof d) & { rtmpDestination: string } => d.rtmpDestination !== null)
      .map((d) => ({ rtmpDestination: d.rtmpDestination }));

    // ffmpeg reads from MediaMTX RTMP (the browser WHIP stream is already there).
    await worker.start(`${this.mediaMtxRtmpBase}/live/${ingestKey}`, destConfigs);

    this.logger.info(
      { sessionId: session.sessionId, destinationCount: destConfigs.length },
      'Stream worker started',
    );
  }

  async stopWorker(ingestKey: string): Promise<void> {
    const worker = this.workers.get(ingestKey);
    if (!worker) return;
    await worker.stop();
    this.workers.delete(ingestKey);
    this.logger.info({ ingestKey }, 'Stream worker stopped');
  }

  activeWorkerCount(): number {
    return this.workers.size;
  }
}
