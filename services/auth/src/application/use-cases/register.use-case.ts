import { randomUUID } from 'node:crypto';
import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.js';
import type { ITokenService, TokenPair } from '../../domain/services/token.service.js';
import { AuthUser } from '../../domain/entities/auth-user.entity.js';
import { EmailVO, PasswordVO } from '@tik-live-pro/domain';
import { ConflictError } from '@tik-live-pro/domain';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { UserId } from '@tik-live-pro/shared-types';
import { SubscriptionTier } from '@tik-live-pro/shared-types';
import type { UserRegisteredPayload } from '@tik-live-pro/events';

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  locale?: string | undefined;
}

export interface RegisterOutput extends TokenPair {
  userId: UserId;
}

export class RegisterUseCase {
  constructor(
    private readonly userRepo: IAuthUserRepository,
    private readonly tokenService: ITokenService,
    private readonly nats: NatsJetStreamClient,
  ) {}

  async execute(input: RegisterInput, correlationId: string): Promise<RegisterOutput> {
    const emailVO = EmailVO.create(input.email);
    const existing = await this.userRepo.findByEmail(emailVO.branded);
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const passwordVO = await PasswordVO.fromPlainText(input.password);
    const userId = randomUUID() as UserId;
    const now = new Date();
    const locale = input.locale ?? 'en';

    const user = AuthUser.create({
      id: userId,
      email: emailVO.branded,
      passwordHash: passwordVO.value,
      displayName: input.displayName.trim(),
      subscriptionTier: SubscriptionTier.FREE,
      locale,
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await this.userRepo.save(user);

    const tokens = await this.tokenService.generateTokenPair(
      userId,
      emailVO.toString(),
      SubscriptionTier.FREE,
    );

    const eventPayload: UserRegisteredPayload = {
      userId,
      email: emailVO.branded,
      displayName: input.displayName.trim(),
      subscriptionTier: SubscriptionTier.FREE,
      locale,
    };

    await this.nats.publish(Subjects.AUTH_USER_REGISTERED, eventPayload, { correlationId });

    return { userId, ...tokens };
  }
}
