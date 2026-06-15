import { randomUUID } from 'node:crypto';
import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';
import type { StreamWorkerFactory, IStreamWorker, StreamWorkerStats, StreamDestinationConfig } from '../ports/stream-worker.port.js';
import type { StreamEventPublisher } from '../../infrastructure/nats/stream-event-publisher.js';
import { DestinationStatus, SocialPlatform as SP } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';
import { StreamSessionStatus } from '../../domain/entities/stream-session.entity.js';
import type { StreamSession } from '../../domain/entities/stream-session.entity.js';
import type { Destination } from '../../domain/entities/destination.entity.js';

// Maximum number of FFmpeg workers that may START concurrently.
// Spawning 50 FFmpeg processes simultaneously causes a CPU spike that can
// crash the host. This semaphore serializes startup bursts.
const MAX_CONCURRENT_WORKER_STARTS = 5;

// When a worker dies after having been live, retry up to this many times with
// exponential backoff (2s, 4s, 6s) before marking the session as ERROR.
// Covers transient network hiccups to TikTok/Facebook without ending the session.
const MAX_WORKER_RETRIES = 3;
const WORKER_RETRY_BASE_DELAY_MS = 2000;

interface WorkerLiveState {
  everLive: boolean;          // true once any attempt has produced stats
  sessionMarkedLive: boolean; // guards the one-time WAITING_FOR_STREAM → LIVE transition
  lastHealthPublish: number;
}

export class HandleStreamArrivedUseCase {
  private readonly workers = new Map<string, IStreamWorker>();
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private activeStarts = 0;
  private readonly startQueue: Array<() => void> = [];

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
    // If the stream reconnected, some destinations may already be in LIVE status.
    const socialDests = session.destinations.filter(
      (d) =>
        d.platform !== SP.PLATFORM &&
        (d.status === DestinationStatus.CONNECTING || d.status === DestinationStatus.LIVE) &&
        d.rtmpDestination !== null,
    );

    if (socialDests.length === 0) {
      // No social accounts — go live immediately (HLS is already available from MediaMTX).
      if (session.status === StreamSessionStatus.WAITING_FOR_STREAM) {
        session.markLive();
        const hlsUrl = `${this.mediaMtxHlsUrl}/live/${ingestKey}/index.m3u8`;
        await this.eventPublisher.sessionLive(session.sessionId, session.userId, hlsUrl, randomUUID());
        await this.sessionRepo.update(session);
        this.logger.info({ sessionId: session.sessionId }, 'Session live (platform-only, no social destinations)');
      } else {
        this.logger.info({ sessionId: session.sessionId }, 'Session already live (platform-only, no social destinations)');
      }
      return;
    }

    // Persist platform-dest LIVE + social-dests CONNECTING before starting the worker
    // so a worker.start() failure doesn't leave the session with unsaved in-memory state.
    await this.sessionRepo.update(session);

    const destConfigs = socialDests
      .filter((d): d is Destination & { rtmpDestination: string } => d.rtmpDestination !== null)
      .map((d): StreamDestinationConfig => ({ rtmpDestination: d.rtmpDestination }));

    // Shared mutable state across all retry attempts for this ingestKey.
    const liveState: WorkerLiveState = {
      everLive: false,
      sessionMarkedLive: false,
      lastHealthPublish: 0,
    };

    await this.launchWorker(ingestKey, session, socialDests, destConfigs, liveState, 0);
  }

  private async launchWorker(
    ingestKey: string,
    session: StreamSession,
    socialDests: Destination[],
    destConfigs: StreamDestinationConfig[],
    liveState: WorkerLiveState,
    retryCount: number,
  ): Promise<void> {
    const worker = this.workerFactory();
    // Guards double-handling: worker.start() can both reject AND fire onError.
    // Once startCompleted is true, the top-level error handler owns errors.
    let startCompleted = false;

    worker.onStats((stats: StreamWorkerStats) => {
      liveState.everLive = true;
      void (async () => {
        // Mark destinations/session LIVE exactly once across all retry attempts.
        if (!liveState.sessionMarkedLive) {
          liveState.sessionMarkedLive = true;
          let changed = false;
          for (const dest of socialDests) {
            try {
              if (dest.status === DestinationStatus.CONNECTING) {
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
                changed = true;
              }
            } catch (err) {
              this.logger.error({ err, accountId: dest.socialAccountId }, 'Failed to mark destination live');
            }
          }

          if (session.status === StreamSessionStatus.WAITING_FOR_STREAM && session.hasAnyLiveDestination()) {
            session.markLive();
            const hlsUrl = `${this.mediaMtxHlsUrl}/live/${ingestKey}/index.m3u8`;
            await this.eventPublisher.sessionLive(session.sessionId, session.userId, hlsUrl, randomUUID());
            changed = true;
          }

          if (changed) {
            await this.sessionRepo.update(session);
          }
        }

        const now = Date.now();
        if (now - liveState.lastHealthPublish >= 5000) {
          liveState.lastHealthPublish = now;
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
      if (!startCompleted) return; // handled by the start() rejection below
      this.workers.delete(ingestKey);
      this.logger.error({ err, sessionId: session.sessionId, retryCount }, 'Stream worker error');

      // Transient failure after the worker was live: retry with exponential backoff.
      // This covers brief network hiccups to TikTok/Facebook without ending the session.
      if (liveState.everLive && retryCount < MAX_WORKER_RETRIES) {
        const delay = (retryCount + 1) * WORKER_RETRY_BASE_DELAY_MS;
        this.logger.warn(
          { ingestKey, attempt: retryCount + 1, delayMs: delay },
          'Worker died after being live — scheduling restart',
        );
        const timer = setTimeout(() => {
          this.retryTimers.delete(ingestKey);
          void this.launchWorker(ingestKey, session, socialDests, destConfigs, liveState, retryCount + 1);
        }, delay);
        this.retryTimers.set(ingestKey, timer);
        return;
      }

      // Permanent failure (startup error or max retries exhausted).
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
        this.logger.error({ sessionId: session.sessionId, retryCount }, 'Stream worker permanently failed');
      })();
    });

    await this.acquireStartSlot();
    try {
      await worker.start(`${this.mediaMtxRtmpBase}/live/${ingestKey}`, destConfigs);
      startCompleted = true;
      this.releaseStartSlot();
    } catch (err) {
      this.releaseStartSlot();
      this.logger.error({ err, sessionId: session.sessionId }, 'Stream worker failed to start');
      for (const dest of session.destinations) {
        if (dest.status === DestinationStatus.LIVE || dest.status === DestinationStatus.CONNECTING) {
          session.markDestinationError(dest.socialAccountId, String(err));
          await this.eventPublisher.destinationStatusChanged(
            session.sessionId,
            dest.socialAccountId,
            dest.platform,
            dest.status,
            DestinationStatus.ERROR,
            String(err),
            randomUUID(),
          );
        }
      }
      if (!session.hasAnyLiveDestination()) {
        session.markError();
        await this.eventPublisher.sessionError(session.sessionId, session.userId, randomUUID());
      }
      await this.sessionRepo.update(session);
      return;
    }

    this.workers.set(ingestKey, worker);

    this.logger.info(
      { sessionId: session.sessionId, destinationCount: destConfigs.length, retryCount },
      'Stream worker started',
    );
  }

  private acquireStartSlot(): Promise<void> {
    if (this.activeStarts < MAX_CONCURRENT_WORKER_STARTS) {
      this.activeStarts++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.startQueue.push(resolve);
    });
  }

  private releaseStartSlot(): void {
    const next = this.startQueue.shift();
    if (next) {
      next();
    } else {
      this.activeStarts--;
    }
  }

  async stopWorker(ingestKey: string): Promise<void> {
    // Cancel any pending retry timer first — must happen before checking workers
    // so a timer that fires between the timer-clear and the workers.delete can't
    // start a new worker after we've decided to stop.
    const timer = this.retryTimers.get(ingestKey);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(ingestKey);
    }
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
