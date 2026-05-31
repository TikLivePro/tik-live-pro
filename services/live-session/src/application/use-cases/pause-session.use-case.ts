import type { ILiveSessionRepository } from '../../domain/repositories/live-session.repository.js';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { SessionStatusChangedPayload } from '@tik-live-pro/events';
import { NotFoundError, ForbiddenError } from '@tik-live-pro/domain';
import type { LiveSessionId, UserId } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';

export class PauseSessionUseCase {
  constructor(
    private readonly sessionRepo: ILiveSessionRepository,
    private readonly nats: NatsJetStreamClient,
    private readonly logger: Logger,
  ) {}

  async execute(sessionId: LiveSessionId, userId: UserId, correlationId: string): Promise<void> {
    const log = this.logger.child({ correlationId, useCase: 'PauseSessionUseCase', sessionId, userId });
    log.debug('PauseSession: start');

    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      log.warn({ sessionId }, 'PauseSession: session not found');
      throw new NotFoundError('LiveSession', sessionId);
    }
    if (session.userId !== userId) {
      log.warn({ sessionId, ownerId: session.userId, requestingUserId: userId }, 'PauseSession: forbidden');
      throw new ForbiddenError();
    }

    const previousStatus = session.status;
    session.pause();

    await this.sessionRepo.update(session);
    log.debug({ sessionId, newStatus: session.status }, 'PauseSession: updated in DB');

    const payload: SessionStatusChangedPayload = {
      sessionId: session.id,
      userId: session.userId,
      previousStatus,
      status: session.status,
      occurredAt: new Date().toISOString(),
    };

    await this.nats.publish(Subjects.SESSION_PAUSED, payload, { correlationId });
    log.info({ sessionId }, 'PauseSession: session paused and event published');
  }
}
