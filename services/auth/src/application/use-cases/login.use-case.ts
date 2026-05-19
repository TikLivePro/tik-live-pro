import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.js';
import type { ITokenService, TokenPair } from '../../domain/services/token.service.js';
import { EmailVO, PasswordVO } from '@tik-live-pro/domain';
import { UnauthorizedError } from '@tik-live-pro/domain';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { UserId } from '@tik-live-pro/shared-types';
import type { UserLoggedInPayload } from '@tik-live-pro/events';

export interface LoginInput {
  email: string;
  password: string;
  ipAddress: string;
  userAgent: string;
}

export interface LoginOutput extends TokenPair {
  userId: UserId;
}

export class LoginUseCase {
  constructor(
    private readonly userRepo: IAuthUserRepository,
    private readonly tokenService: ITokenService,
    private readonly nats: NatsJetStreamClient,
  ) {}

  async execute(input: LoginInput, correlationId: string): Promise<LoginOutput> {
    const emailVO = EmailVO.create(input.email);
    const user = await this.userRepo.findByEmail(emailVO.branded);

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const passwordVO = PasswordVO.fromHash(user.passwordHash);
    const isValid = await passwordVO.verify(input.password);
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const tokens = await this.tokenService.generateTokenPair(
      user.id,
      user.email,
      user.subscriptionTier,
    );

    const eventPayload: UserLoggedInPayload = {
      userId: user.id,
      email: user.email,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };

    await this.nats.publish(Subjects.AUTH_USER_LOGGED_IN, eventPayload, { correlationId });

    return { userId: user.id, ...tokens };
  }
}
