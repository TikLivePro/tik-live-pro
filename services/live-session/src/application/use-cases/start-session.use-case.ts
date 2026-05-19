import type { ILiveSessionRepository } from '../../domain/repositories/live-session.repository.js';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { SessionStatusChangedPayload } from '@tik-live-pro/events';
import { NotFoundError, ForbiddenError } from '@tik-live-pro/domain';
import type { LiveSessionId, UserId } from '@tik-live-pro/shared-types';

export class StartSessionUseCase {
  constructor(
    private readonly sessionRepo: ILiveSessionRepository,
    private readonly nats: NatsJetStreamClient,
  ) {}

  async execute(sessionId: LiveSessionId, userId: UserId, correlationId: string): Promise<void> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) throw new NotFoundError('LiveSession', sessionId);
    if (session.userId !== userId) throw new ForbiddenError();

    const previousStatus = session.status;
    session.start();
    await this.sessionRepo.update(session);

    const payload: SessionStatusChangedPayload = {
      sessionId: session.id,
      userId: session.userId,
      previousStatus,
      status: session.status,
      occurredAt: new Date().toISOString(),
    };

    await this.nats.publish(Subjects.SESSION_STARTING, payload, { correlationId });
  }
}
