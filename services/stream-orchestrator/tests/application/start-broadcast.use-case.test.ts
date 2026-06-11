import { StartBroadcastUseCase } from '../../src/application/use-cases/start-broadcast.use-case.js';
import { StreamSession } from '../../src/domain/entities/stream-session.entity.js';
import type { IStreamSessionRepository } from '../../src/domain/repositories/stream-session.repository.js';
import type { ITokenProvider } from '../../src/application/ports/token-provider.port.js';
import type { StreamEventPublisher } from '../../src/infrastructure/nats/stream-event-publisher.js';
import type { AdapterRegistry } from '@tik-live-pro/platform-adapters';
import type { IPlatformAdapter } from '@tik-live-pro/platform-adapters';
import type { Logger } from '@tik-live-pro/logger';
import type { LiveSessionId, UserId, SocialAccountId } from '@tik-live-pro/shared-types';
import { SocialPlatform, DestinationStatus } from '@tik-live-pro/shared-types';

const sessionId = 'sess-001' as LiveSessionId;
const userId = 'user-001' as UserId;
const accountId = 'acc-001' as SocialAccountId;

function makeSession(): StreamSession {
  return StreamSession.create(sessionId, userId, 'My Stream', null, [accountId]);
}

function makeRepo(session: StreamSession | null): jest.Mocked<IStreamSessionRepository> {
  return {
    findBySessionId: jest.fn().mockResolvedValue(session),
    findByIngestKey: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
}

function makeTokenProvider(): jest.Mocked<ITokenProvider> {
  return {
    getToken: jest.fn().mockResolvedValue({
      accessToken: 'tok-123',
      platform: SocialPlatform.TIKTOK,
      platformUserId: 'platform-uid',
    }),
  };
}

function makeAdapterRegistry(): jest.Mocked<AdapterRegistry> {
  const adapter: jest.Mocked<IPlatformAdapter> = {
    platform: SocialPlatform.TIKTOK,
    exchangeCode: jest.fn(),
    refreshTokens: jest.fn(),
    revokeTokens: jest.fn(),
    getUser: jest.fn(),
    createLiveStream: jest.fn().mockResolvedValue({
      rtmpUrl: 'rtmp://live.tiktok.com',
      streamKey: 'sk-123',
      expiresAt: null,
    }),
    endLiveStream: jest.fn(),
    pollComments: jest.fn(),
  };
  return {
    register: jest.fn(),
    get: jest.fn().mockReturnValue(adapter),
    has: jest.fn().mockReturnValue(true),
    supported: jest.fn().mockReturnValue([SocialPlatform.TIKTOK]),
  } as unknown as jest.Mocked<AdapterRegistry>;
}

function makeEventPublisher(): jest.Mocked<StreamEventPublisher> {
  return {
    destinationStatusChanged: jest.fn().mockResolvedValue(undefined),
    sessionLive: jest.fn().mockResolvedValue(undefined),
    sessionError: jest.fn().mockResolvedValue(undefined),
    healthUpdated: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<StreamEventPublisher>;
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

describe('StartBroadcastUseCase', () => {
  it('resolves tokens, creates live streams, sets ingest key, and saves session', async () => {
    const session = makeSession();
    const repo = makeRepo(session);
    const tokenProvider = makeTokenProvider();
    const adapterRegistry = makeAdapterRegistry();
    const eventPublisher = makeEventPublisher();

    const useCase = new StartBroadcastUseCase(
      repo, tokenProvider, adapterRegistry, eventPublisher, 'rtmp://localhost:1936', mockLogger,
    );

    const result = await useCase.execute({ sessionId, correlationId: 'corr-1' });

    expect(result.ingestKey).toBeTruthy();
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(tokenProvider.getToken).toHaveBeenCalledWith(accountId);
    expect(adapterRegistry.get).toHaveBeenCalledWith(SocialPlatform.TIKTOK);
    expect(eventPublisher.destinationStatusChanged).toHaveBeenCalledWith(
      sessionId, accountId, SocialPlatform.TIKTOK,
      DestinationStatus.PENDING, DestinationStatus.CONNECTING,
      null, 'corr-1',
    );
  });

  it('throws NOT_FOUND when session does not exist', async () => {
    const repo = makeRepo(null);
    const useCase = new StartBroadcastUseCase(
      repo, makeTokenProvider(), makeAdapterRegistry(), makeEventPublisher(), 'rtmp://localhost:1936', mockLogger,
    );
    await expect(useCase.execute({ sessionId, correlationId: 'corr-1' })).rejects.toThrow('not found');
  });

  it('succeeds and returns ingestKey even when all token resolutions fail', async () => {
    const session = makeSession();
    const repo = makeRepo(session);
    const tokenProvider = makeTokenProvider();
    tokenProvider.getToken.mockRejectedValue(new Error('Network error'));

    const useCase = new StartBroadcastUseCase(
      repo, tokenProvider, makeAdapterRegistry(), makeEventPublisher(), 'rtmp://localhost:1936', mockLogger,
    );

    const result = await useCase.execute({ sessionId, correlationId: 'corr-1' });
    expect(result.ingestKey).toBeTruthy();
    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it('succeeds and returns ingestKey even when all createLiveStream calls fail', async () => {
    const session = makeSession();
    const repo = makeRepo(session);
    const adapterRegistry = makeAdapterRegistry();
    const adapter = adapterRegistry.get(SocialPlatform.TIKTOK) as jest.Mocked<IPlatformAdapter>;
    adapter.createLiveStream.mockRejectedValue(new Error('API error'));

    const useCase = new StartBroadcastUseCase(
      repo, makeTokenProvider(), adapterRegistry, makeEventPublisher(), 'rtmp://localhost:1936', mockLogger,
    );

    const result = await useCase.execute({ sessionId, correlationId: 'corr-1' });
    expect(result.ingestKey).toBeTruthy();
    expect(repo.update).toHaveBeenCalledTimes(1);
  });
});
