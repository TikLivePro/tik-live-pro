import { StreamSession } from '../../domain/entities/stream-session.entity.js';
import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';
import type { LiveSessionId, UserId, SocialAccountId } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';

export interface RegisterSessionInput {
  sessionId: LiveSessionId;
  userId: UserId;
  title: string;
  description: string | null;
  destinationAccountIds: SocialAccountId[];
}

export class RegisterSessionUseCase {
  constructor(
    private readonly sessionRepo: IStreamSessionRepository,
    private readonly logger: Logger,
  ) {}

  async execute(input: RegisterSessionInput): Promise<void> {
    const existing = await this.sessionRepo.findBySessionId(input.sessionId);
    if (existing) {
      this.logger.warn({ sessionId: input.sessionId }, 'Session already registered, skipping');
      return;
    }

    const session = StreamSession.create(
      input.sessionId,
      input.userId,
      input.title,
      input.description,
      input.destinationAccountIds,
    );

    await this.sessionRepo.save(session);
    this.logger.info({ sessionId: input.sessionId }, 'Session registered');
  }
}
