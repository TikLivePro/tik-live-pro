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
import type { Logger } from '@tik-live-pro/logger';
import type { IEmailService } from '../ports/email.service.port.js';

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
    private readonly logger: Logger,
    private readonly emailService?: IEmailService,
  ) {}

  async execute(input: RegisterInput, correlationId: string): Promise<RegisterOutput> {
    const log = this.logger.child({ correlationId, useCase: 'RegisterUseCase' });
    log.debug({ email: input.email, displayName: input.displayName }, 'Register: start');

    const emailVO = EmailVO.create(input.email);
    log.debug({ email: emailVO.branded }, 'Register: email validated');

    const existing = await this.userRepo.findByEmail(emailVO.branded);
    if (existing) {
      log.warn({ email: emailVO.branded }, 'Register: email already taken');
      throw new ConflictError('Email already registered');
    }
    log.debug({ email: emailVO.branded }, 'Register: email is available');

    log.debug('Register: hashing password');
    const passwordVO = await PasswordVO.fromPlainText(input.password);
    const userId = randomUUID() as UserId;
    const now = new Date();
    const locale = input.locale ?? 'en';

    const user = AuthUser.create({
      id: userId,
      email: emailVO.branded,
      passwordHash: passwordVO.value,
      displayName: input.displayName.trim(),
      avatarUrl: null,
      subscriptionTier: SubscriptionTier.FREE,
      locale,
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    log.debug({ userId }, 'Register: saving user to DB');
    await this.userRepo.save(user);
    log.debug({ userId }, 'Register: user persisted');

    log.debug({ userId }, 'Register: generating token pair');
    const tokens = await this.tokenService.generateTokenPair(
      userId,
      emailVO.toString(),
      SubscriptionTier.FREE,
    );
    log.debug({ userId }, 'Register: token pair generated');

    const eventPayload: UserRegisteredPayload = {
      userId,
      email: emailVO.branded,
      displayName: input.displayName.trim(),
      subscriptionTier: SubscriptionTier.FREE,
      locale,
    };

    log.debug({ userId, subject: Subjects.AUTH_USER_REGISTERED }, 'Register: publishing NATS event');
    await this.nats.publish(Subjects.AUTH_USER_REGISTERED, eventPayload, { correlationId });

    log.info({ userId, email: emailVO.branded }, 'Register: user registered successfully');

    if (this.emailService) {
      void this.emailService.sendWelcome({
        to: emailVO.branded,
        displayName: input.displayName.trim(),
        locale,
      });
    }

    return { userId, ...tokens };
  }
}
