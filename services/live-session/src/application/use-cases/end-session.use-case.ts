import type { ILiveSessionRepository } from '../../domain/repositories/live-session.repository.js';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { SessionStatusChangedPayload } from '@tik-live-pro/events';
import { NotFoundError, ForbiddenError } from '@tik-live-pro/domain';
import type { LiveSessionId, UserId } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';

export class EndSessionUseCase {
  constructor(
    private readonly sessionRepo: ILiveSessionRepository,
    private readonly nats: NatsJetStreamClient,
    private readonly logger: Logger,
  ) {}

  async execute(sessionId: LiveSessionId, userId: UserId, correlationId: string): Promise<void> {
    const log = this.logger.child({ correlationId, useCase: 'EndSessionUseCase', sessionId, userId });
    log.debug('EndSession: start');

    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      log.warn({ sessionId }, 'EndSession: session not found');
      throw new NotFoundError('LiveSession', sessionId);
    }
    if (session.userId !== userId) {
      log.warn({ sessionId, ownerId: session.userId, requestingUserId: userId }, 'EndSession: forbidden');
      throw new ForbiddenError();
    }

    const previousStatus = session.status;
    const didChange = session.end();

    if (!didChange) {
      log.info({ sessionId, status: session.status }, 'EndSession: already ending/ended — idempotent no-op');
      return;
    }

    await this.sessionRepo.update(session);
    log.debug({ sessionId, newStatus: session.status }, 'EndSession: updated in DB');

    const payload: SessionStatusChangedPayload = {
      sessionId: session.id,
      userId: session.userId,
      previousStatus,
      status: session.status,
      occurredAt: new Date().toISOString(),
    };

    await this.nats.publish(Subjects.SESSION_ENDED, payload, { correlationId });
    log.info({ sessionId }, 'EndSession: session ended and event published');
  }
}
