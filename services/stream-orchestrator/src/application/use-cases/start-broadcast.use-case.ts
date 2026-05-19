import { randomUUID } from 'node:crypto';
import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';
import type { ITokenProvider } from '../ports/token-provider.port.js';
import type { StreamTargetInfo } from '../../domain/value-objects/stream-target-info.js';
import type { AdapterRegistry } from '@tik-live-pro/platform-adapters';
import type { StreamEventPublisher } from '../../infrastructure/nats/stream-event-publisher.js';
import { DomainError, NotFoundError } from '@tik-live-pro/domain';
import type { LiveSessionId, SocialAccountId, SocialPlatform } from '@tik-live-pro/shared-types';
import { DestinationStatus } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';

export interface StartBroadcastInput {
  sessionId: LiveSessionId;
  correlationId: string;
}

export interface StartBroadcastOutput {
  ingestKey: string;
}

export class StartBroadcastUseCase {
  constructor(
    private readonly sessionRepo: IStreamSessionRepository,
    private readonly tokenProvider: ITokenProvider,
    private readonly adapterRegistry: AdapterRegistry,
    private readonly eventPublisher: StreamEventPublisher,
    private readonly logger: Logger,
  ) {}

  async execute(input: StartBroadcastInput): Promise<StartBroadcastOutput> {
    const session = await this.sessionRepo.findBySessionId(input.sessionId);
    if (!session) throw new NotFoundError('StreamSession', input.sessionId);

    session.beginStartup();

    // Resolve OAuth tokens for all pending account IDs
    const accountIds = Array.from(session.pendingAccountIds);
    const tokenResults = await Promise.allSettled(
      accountIds.map((id) => this.tokenProvider.getToken(id)),
    );

    const resolvedAccounts: Array<{
      accountId: SocialAccountId;
      accessToken: string;
      platform: SocialPlatform;
    }> = [];

    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      const result = tokenResults[i];
      if (!accountId || !result) continue;

      if (result.status === 'rejected') {
        this.logger.warn({ accountId, err: result.reason }, 'Failed to get token for account');
        continue;
      }

      session.addDestination(accountId, result.value.platform);
      resolvedAccounts.push({
        accountId,
        accessToken: result.value.accessToken,
        platform: result.value.platform,
      });
    }

    if (resolvedAccounts.length === 0) {
      session.markError();
      await this.sessionRepo.update(session);
      throw new DomainError('No valid destinations for broadcast', 'NO_DESTINATIONS');
    }

    // Create live streams on all platforms in parallel
    const streamTargetResults = await Promise.allSettled(
      resolvedAccounts.map(({ accessToken, platform }) => {
        const adapter = this.adapterRegistry.get(platform);
        return adapter.createLiveStream(accessToken, session.title, session.description);
      }),
    );

    let connectingCount = 0;

    for (let i = 0; i < resolvedAccounts.length; i++) {
      const account = resolvedAccounts[i];
      const result = streamTargetResults[i];
      if (!account || !result) continue;

      if (result.status === 'rejected') {
        session.markDestinationError(account.accountId, String(result.reason));
        await this.eventPublisher.destinationStatusChanged(
          session.sessionId,
          account.accountId,
          account.platform,
          DestinationStatus.PENDING,
          DestinationStatus.ERROR,
          String(result.reason),
          input.correlationId,
        );
        this.logger.error({ accountId: account.accountId, err: result.reason }, 'createLiveStream failed');
      } else {
        const targetInfo: StreamTargetInfo = {
          rtmpUrl: result.value.rtmpUrl,
          streamKey: result.value.streamKey,
          platformStreamId: result.value.platformStreamId ?? null,
          expiresAt: result.value.expiresAt,
        };
        session.assignDestinationTarget(account.accountId, targetInfo);
        await this.eventPublisher.destinationStatusChanged(
          session.sessionId,
          account.accountId,
          account.platform,
          DestinationStatus.PENDING,
          DestinationStatus.CONNECTING,
          null,
          input.correlationId,
        );
        connectingCount++;
      }
    }

    if (connectingCount === 0) {
      session.markError();
      await this.sessionRepo.update(session);
      throw new DomainError('All destinations failed to initialize', 'ALL_DESTINATIONS_FAILED');
    }

    const ingestKey = randomUUID();
    session.readyForStream(ingestKey);
    await this.sessionRepo.update(session);

    this.logger.info({ sessionId: input.sessionId, ingestKey, connectingCount }, 'Broadcast ready, awaiting stream connection');
    return { ingestKey };
  }
}
