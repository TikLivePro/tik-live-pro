import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.js';
import type { ITokenService, TokenPair } from '../../domain/services/token.service.js';
import { EmailVO, PasswordVO } from '@tik-live-pro/domain';
import { UnauthorizedError } from '@tik-live-pro/domain';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { UserId } from '@tik-live-pro/shared-types';
import type { UserLoggedInPayload } from '@tik-live-pro/events';
import type { Logger } from '@tik-live-pro/logger';

export interface LoginInput {
  email: string;
  password: string;
  ipAddress: string;
  userAgent: string;
}

export interface LoginOutput extends TokenPair {
  userId: UserId;
  subscriptionTier: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

export class LoginUseCase {
  constructor(
    private readonly userRepo: IAuthUserRepository,
    private readonly tokenService: ITokenService,
    private readonly nats: NatsJetStreamClient,
    private readonly logger: Logger,
  ) {}

  async execute(input: LoginInput, correlationId: string): Promise<LoginOutput> {
    const log = this.logger.child({ correlationId, useCase: 'LoginUseCase' });
    log.debug({ email: input.email, ip: input.ipAddress }, 'Login: start');

    const emailVO = EmailVO.create(input.email);
    log.debug({ email: emailVO.branded }, 'Login: looking up user');
    const user = await this.userRepo.findByEmail(emailVO.branded);

    if (!user) {
      log.warn({ email: emailVO.branded }, 'Login: user not found — returning generic error');
      throw new UnauthorizedError('Invalid credentials');
    }
    log.debug({ userId: user.id }, 'Login: user found, verifying password');

    const passwordVO = PasswordVO.fromHash(user.passwordHash);
    const isValid = await passwordVO.verify(input.password);
    if (!isValid) {
      log.warn({ userId: user.id }, 'Login: invalid password');
      throw new UnauthorizedError('Invalid credentials');
    }
    log.debug({ userId: user.id }, 'Login: password verified');

    log.debug({ userId: user.id }, 'Login: generating token pair');
    const tokens = await this.tokenService.generateTokenPair(
      user.id,
      user.email,
      user.subscriptionTier,
    );
    log.debug({ userId: user.id }, 'Login: token pair generated');

    const eventPayload: UserLoggedInPayload = {
      userId: user.id,
      email: user.email,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };

    log.debug({ userId: user.id, subject: Subjects.AUTH_USER_LOGGED_IN }, 'Login: publishing NATS event');
    await this.nats.publish(Subjects.AUTH_USER_LOGGED_IN, eventPayload, { correlationId });

    log.info({ userId: user.id, email: user.email }, 'Login: success');
    return {
      userId: user.id,
      subscriptionTier: user.subscriptionTier,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      ...tokens,
    };
  }
}
