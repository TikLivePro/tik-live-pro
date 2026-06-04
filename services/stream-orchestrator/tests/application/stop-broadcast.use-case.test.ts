import { StopBroadcastUseCase } from '../../src/application/use-cases/stop-broadcast.use-case.js';
import { StreamSession, StreamSessionStatus } from '../../src/domain/entities/stream-session.entity.js';
import type { IStreamSessionRepository } from '../../src/domain/repositories/stream-session.repository.js';
import type { ITokenProvider } from '../../src/application/ports/token-provider.port.js';
import type { StreamEventPublisher } from '../../src/infrastructure/nats/stream-event-publisher.js';
import type { HandleStreamArrivedUseCase } from '../../src/application/use-cases/handle-stream-arrived.use-case.js';
import type { AdapterRegistry, IPlatformAdapter } from '@tik-live-pro/platform-adapters';
import type { Logger } from '@tik-live-pro/logger';
import type { LiveSessionId, UserId, SocialAccountId } from '@tik-live-pro/shared-types';
import { SocialPlatform, DestinationStatus } from '@tik-live-pro/shared-types';
import type { StreamTargetInfo } from '../../src/domain/value-objects/stream-target-info.js';

global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);

const sessionId = 'sess-001' as LiveSessionId;
const userId = 'user-001' as UserId;
const accountId = 'acc-001' as SocialAccountId;

const target: StreamTargetInfo = {
  rtmpUrl: 'rtmp://live.tiktok.com',
  streamKey: 'sk-1',
  platformStreamId: null,
  expiresAt: null,
};

function makeLiveSession(): StreamSession {
  const s = StreamSession.create(sessionId, userId, 'Test', null, [accountId]);
  s.beginStartup();
  s.addDestination(accountId, SocialPlatform.TIKTOK);
  s.assignDestinationTarget(accountId, target);
  s.markDestinationLive(accountId);
  s.readyForStream('ingest-key');
  s.markLive();
  return s;
}

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

describe('StopBroadcastUseCase', () => {
  it('stops the worker, ends live streams, marks session ENDED', async () => {
    const session = makeLiveSession();

    const repo: jest.Mocked<IStreamSessionRepository> = {
      findBySessionId: jest.fn().mockResolvedValue(session),
      findByIngestKey: jest.fn(),
      save: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const tokenProvider: jest.Mocked<ITokenProvider> = {
      getToken: jest.fn().mockResolvedValue({
        accessToken: 'tok-123',
        platform: SocialPlatform.TIKTOK,
        platformUserId: 'uid',
      }),
    };

    const adapter: jest.Mocked<IPlatformAdapter> = {
      platform: SocialPlatform.TIKTOK,
      exchangeCode: jest.fn(),
      refreshTokens: jest.fn(),
      revokeTokens: jest.fn(),
      getUser: jest.fn(),
      createLiveStream: jest.fn(),
      endLiveStream: jest.fn().mockResolvedValue(undefined),
      pollComments: jest.fn(),
    };

    const adapterRegistry: jest.Mocked<AdapterRegistry> = {
      register: jest.fn(),
      get: jest.fn().mockReturnValue(adapter),
      has: jest.fn(),
      supported: jest.fn(),
    } as unknown as jest.Mocked<AdapterRegistry>;

    const streamArrivalHandler: jest.Mocked<HandleStreamArrivedUseCase> = {
      execute: jest.fn(),
      stopWorker: jest.fn().mockResolvedValue(undefined),
      activeWorkerCount: jest.fn().mockReturnValue(0),
    } as unknown as jest.Mocked<HandleStreamArrivedUseCase>;

    const eventPublisher: jest.Mocked<StreamEventPublisher> = {
      destinationStatusChanged: jest.fn().mockResolvedValue(undefined),
      sessionLive: jest.fn(),
      sessionError: jest.fn(),
      healthUpdated: jest.fn(),
      sessionBroadcastStopped: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<StreamEventPublisher>;

    const useCase = new StopBroadcastUseCase(
      repo, tokenProvider, adapterRegistry, streamArrivalHandler, eventPublisher, mockLogger,
      'http://localhost:9997', undefined,
    );

    await useCase.execute({ sessionId, correlationId: 'corr-1' });

    expect(streamArrivalHandler.stopWorker).toHaveBeenCalledWith('ingest-key');
    expect(adapter.endLiveStream).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(session.status).toBe(StreamSessionStatus.ENDED);
    expect(eventPublisher.destinationStatusChanged).toHaveBeenCalledWith(
      sessionId, accountId, SocialPlatform.TIKTOK,
      DestinationStatus.LIVE, DestinationStatus.ENDED,
      null, 'corr-1',
    );
  });

  it('is idempotent for already-ended sessions', async () => {
    const session = makeLiveSession();
    session.beginEnding();
    session.markEnded();

    const repo: jest.Mocked<IStreamSessionRepository> = {
      findBySessionId: jest.fn().mockResolvedValue(session),
      findByIngestKey: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    const useCase = new StopBroadcastUseCase(
      repo,
      { getToken: jest.fn() },
      { get: jest.fn(), register: jest.fn(), has: jest.fn(), supported: jest.fn() } as unknown as AdapterRegistry,
      { stopWorker: jest.fn(), execute: jest.fn(), activeWorkerCount: jest.fn() } as unknown as HandleStreamArrivedUseCase,
      { destinationStatusChanged: jest.fn(), sessionLive: jest.fn(), sessionError: jest.fn(), healthUpdated: jest.fn(), sessionBroadcastStopped: jest.fn().mockResolvedValue(undefined) } as unknown as StreamEventPublisher,
      mockLogger,
      'http://localhost:9997', undefined,
    );

    await useCase.execute({ sessionId, correlationId: 'corr-1' });
    expect(repo.update).not.toHaveBeenCalled();
  });
});
