import type { ILiveSessionRepository } from '../../domain/repositories/live-session.repository.js';
import { LiveSession } from '../../domain/entities/live-session.entity.js';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { SessionCreatedPayload } from '@tik-live-pro/events';
import type { LiveSessionId, UserId, SocialAccountId } from '@tik-live-pro/shared-types';
import { ConflictError } from '@tik-live-pro/domain';
import type { Logger } from '@tik-live-pro/logger';

export interface CreateSessionInput {
  userId: UserId;
  title: string;
  description?: string;
  destinationAccountIds: SocialAccountId[];
  shouldRecord: boolean;
}

export interface CreateSessionOutput {
  sessionId: LiveSessionId;
}

export class CreateSessionUseCase {
  constructor(
    private readonly sessionRepo: ILiveSessionRepository,
    private readonly nats: NatsJetStreamClient,
    private readonly logger: Logger,
  ) {}

  async execute(input: CreateSessionInput, correlationId: string): Promise<CreateSessionOutput> {
    const log = this.logger.child({ correlationId, useCase: 'CreateSessionUseCase', userId: input.userId });
    log.debug({ title: input.title, destinations: input.destinationAccountIds.length }, 'CreateSession: start');

    log.debug({ userId: input.userId }, 'CreateSession: checking for active session');
    const existing = await this.sessionRepo.findActiveByUserId(input.userId);
    if (existing) {
      log.warn({ userId: input.userId, existingSessionId: existing.id }, 'CreateSession: user already has active session');
      throw new ConflictError('User already has an active session');
    }

    const session = LiveSession.create(
      input.userId,
      input.title.trim(),
      input.description?.trim() ?? null,
      input.shouldRecord,
    );
    log.debug({ sessionId: session.id }, 'CreateSession: session entity created');

    log.debug({ sessionId: session.id }, 'CreateSession: persisting session');
    await this.sessionRepo.save(session);
    log.debug({ sessionId: session.id }, 'CreateSession: session persisted');

    const payload: SessionCreatedPayload = {
      sessionId: session.id,
      userId: session.userId,
      title: session.title,
      description: session.description,
      destinationAccountIds: input.destinationAccountIds,
      shouldRecord: session.shouldRecord,
    };

    log.debug({ sessionId: session.id, subject: Subjects.SESSION_CREATED }, 'CreateSession: publishing NATS event');
    await this.nats.publish(Subjects.SESSION_CREATED, payload, { correlationId });

    log.info({ sessionId: session.id }, 'CreateSession: session created successfully');
    return { sessionId: session.id };
  }
}
