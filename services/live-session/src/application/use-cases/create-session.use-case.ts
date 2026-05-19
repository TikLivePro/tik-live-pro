import type { ILiveSessionRepository } from '../../domain/repositories/live-session.repository.js';
import { LiveSession } from '../../domain/entities/live-session.entity.js';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { SessionCreatedPayload } from '@tik-live-pro/events';
import type { LiveSessionId, UserId, SocialAccountId } from '@tik-live-pro/shared-types';
import { ConflictError } from '@tik-live-pro/domain';

export interface CreateSessionInput {
  userId: UserId;
  title: string;
  description?: string;
  destinationAccountIds: SocialAccountId[];
}

export interface CreateSessionOutput {
  sessionId: LiveSessionId;
}

export class CreateSessionUseCase {
  constructor(
    private readonly sessionRepo: ILiveSessionRepository,
    private readonly nats: NatsJetStreamClient,
  ) {}

  async execute(input: CreateSessionInput, correlationId: string): Promise<CreateSessionOutput> {
    const existing = await this.sessionRepo.findActiveByUserId(input.userId);
    if (existing) {
      throw new ConflictError('User already has an active session');
    }

    const session = LiveSession.create(
      input.userId,
      input.title.trim(),
      input.description?.trim() ?? null,
    );

    await this.sessionRepo.save(session);

    const payload: SessionCreatedPayload = {
      sessionId: session.id,
      userId: session.userId,
      title: session.title,
      description: session.description,
      destinationAccountIds: input.destinationAccountIds,
    };

    await this.nats.publish(Subjects.SESSION_CREATED, payload, { correlationId });

    return { sessionId: session.id };
  }
}
