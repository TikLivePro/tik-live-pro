import type { ILiveSessionRepository } from '../../domain/repositories/live-session.repository.js';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { SessionStatusChangedPayload } from '@tik-live-pro/events';
import { NotFoundError, ForbiddenError } from '@tik-live-pro/domain';
import type { LiveSessionId, UserId } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';

export class StartSessionUseCase {
  constructor(
    private readonly sessionRepo: ILiveSessionRepository,
    private readonly nats: NatsJetStreamClient,
    private readonly logger: Logger,
  ) {}

  async execute(sessionId: LiveSessionId, userId: UserId, correlationId: string): Promise<void> {
    const log = this.logger.child({ correlationId, useCase: 'StartSessionUseCase', sessionId, userId });
    log.debug('StartSession: start');

    log.debug({ sessionId }, 'StartSession: loading session from DB');
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      log.warn({ sessionId }, 'StartSession: session not found');
      throw new NotFoundError('LiveSession', sessionId);
    }
    if (session.userId !== userId) {
      log.warn({ sessionId, ownerId: session.userId, requestingUserId: userId }, 'StartSession: forbidden — user does not own session');
      throw new ForbiddenError();
    }

    const previousStatus = session.status;
    log.debug({ sessionId, previousStatus }, 'StartSession: transitioning to starting');
    session.start();
    await this.sessionRepo.update(session);
    log.debug({ sessionId, newStatus: session.status }, 'StartSession: session updated in DB');

    const payload: SessionStatusChangedPayload = {
      sessionId: session.id,
      userId: session.userId,
      previousStatus,
      status: session.status,
      occurredAt: new Date().toISOString(),
    };

    log.debug({ sessionId, subject: Subjects.SESSION_STARTING }, 'StartSession: publishing NATS event');
    await this.nats.publish(Subjects.SESSION_STARTING, payload, { correlationId });

    log.info({ sessionId, status: session.status }, 'StartSession: session started');
  }
}
