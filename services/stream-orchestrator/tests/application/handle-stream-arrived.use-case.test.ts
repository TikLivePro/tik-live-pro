import { HandleStreamArrivedUseCase } from '../../src/application/use-cases/handle-stream-arrived.use-case.js';
import { StreamSession, StreamSessionStatus } from '../../src/domain/entities/stream-session.entity.js';
import type { IStreamSessionRepository } from '../../src/domain/repositories/stream-session.repository.js';
import type { StreamEventPublisher } from '../../src/infrastructure/nats/stream-event-publisher.js';
import type { IStreamWorker, StreamWorkerFactory, StreamWorkerStats } from '../../src/application/ports/stream-worker.port.js';
import type { Logger } from '@tik-live-pro/logger';
import type { LiveSessionId, UserId, SocialAccountId } from '@tik-live-pro/shared-types';
import { SocialPlatform, DestinationStatus } from '@tik-live-pro/shared-types';

const sessionId = 'sess-001' as LiveSessionId;
const userId = 'user-001' as UserId;
const accountId = 'acc-001' as SocialAccountId;

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn().mockReturnThis(),
  level: 'info',
  silent: jest.fn(),
} as unknown as Logger;

function makeWaitingSession(social: boolean = false): StreamSession {
  const s = StreamSession.create(sessionId, userId, 'Test', null, social ? [accountId] : []);
  s.beginStartup();
  if (social) {
    s.addDestination(accountId, SocialPlatform.TIKTOK);
    s.assignDestinationTarget(accountId, {
      rtmpUrl: 'rtmp://live.tiktok.com',
      streamKey: 'sk-1',
      platformStreamId: null,
      expiresAt: null,
    });
  }
  s.readyForStream('ingest-key');
  return s;
}

describe('HandleStreamArrivedUseCase', () => {
  let repo: jest.Mocked<IStreamSessionRepository>;
  let eventPublisher: jest.Mocked<StreamEventPublisher>;
  let mockWorker: jest.Mocked<IStreamWorker>;
  let workerFactory: jest.Mock;

  beforeEach(() => {
    repo = {
      findBySessionId: jest.fn(),
      findByIngestKey: jest.fn(),
      save: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    eventPublisher = {
      destinationStatusChanged: jest.fn().mockResolvedValue(undefined),
      sessionLive: jest.fn().mockResolvedValue(undefined),
      sessionError: jest.fn().mockResolvedValue(undefined),
      healthUpdated: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<StreamEventPublisher>;

    mockWorker = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      onStats: jest.fn(),
      onError: jest.fn(),
      isRunning: false,
    };

    workerFactory = jest.fn().mockReturnValue(mockWorker);
  });

  it('goes live immediately if there are no social destinations', async () => {
    const session = makeWaitingSession(false);
    repo.findByIngestKey.mockResolvedValue(session);

    const useCase = new HandleStreamArrivedUseCase(
      repo,
      eventPublisher,
      workerFactory,
      'rtmp://localhost:1935',
      'http://localhost:8888',
      mockLogger,
    );

    await useCase.execute('ingest-key');

    expect(session.status).toBe(StreamSessionStatus.LIVE);
    expect(eventPublisher.sessionLive).toHaveBeenCalledWith(
      sessionId,
      userId,
      'http://localhost:8888/live/ingest-key/index.m3u8',
      expect.any(String),
    );
    expect(repo.update).toHaveBeenCalledWith(session);
  });

  it('spawns ffmpeg worker and transitions status when social destinations are present', async () => {
    const session = makeWaitingSession(true);
    repo.findByIngestKey.mockResolvedValue(session);

    const useCase = new HandleStreamArrivedUseCase(
      repo,
      eventPublisher,
      workerFactory,
      'rtmp://localhost:1935',
      'http://localhost:8888',
      mockLogger,
    );

    let statsCallback: ((stats: StreamWorkerStats) => void) | undefined;
    mockWorker.onStats.mockImplementation((cb) => {
      statsCallback = cb;
    });

    await useCase.execute('ingest-key');

    expect(workerFactory).toHaveBeenCalled();
    expect(mockWorker.start).toHaveBeenCalledWith(
      'rtmp://localhost:1935/live/ingest-key',
      [{ rtmpDestination: 'rtmp://live.tiktok.com/sk-1' }],
    );

    // Call stats callback to simulate stream active stats
    expect(statsCallback).toBeDefined();
    await statsCallback!({
      fps: 30,
      bitrateKbps: 2000,
      sentBytes: 50000,
      droppedFrames: 0,
      uptimeSeconds: 5,
    });

    expect(session.status).toBe(StreamSessionStatus.LIVE);
    expect(session.destinations[0].status).toBe(DestinationStatus.LIVE);
    expect(eventPublisher.destinationStatusChanged).toHaveBeenCalledWith(
      sessionId,
      accountId,
      SocialPlatform.TIKTOK,
      DestinationStatus.CONNECTING,
      DestinationStatus.LIVE,
      null,
      expect.any(String),
    );
    expect(eventPublisher.sessionLive).toHaveBeenCalledWith(
      sessionId,
      userId,
      'http://localhost:8888/live/ingest-key/index.m3u8',
      expect.any(String),
    );
  });

  it('is idempotent and does not throw when session is already live', async () => {
    const session = makeWaitingSession(true);
    // Mark it live manually
    session.markLive();
    repo.findByIngestKey.mockResolvedValue(session);

    const useCase = new HandleStreamArrivedUseCase(
      repo,
      eventPublisher,
      workerFactory,
      'rtmp://localhost:1935',
      'http://localhost:8888',
      mockLogger,
    );

    // Should not throw INVALID_STATUS error
    await expect(useCase.execute('ingest-key')).resolves.not.toThrow();
  });
});
