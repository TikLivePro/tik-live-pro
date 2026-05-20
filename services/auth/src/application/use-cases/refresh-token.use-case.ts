import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.js';
import type { ITokenService, TokenPair } from '../../domain/services/token.service.js';
import { UnauthorizedError } from '@tik-live-pro/domain';
import type { Logger } from '@tik-live-pro/logger';

export interface RefreshTokenOutput extends TokenPair {
  userId: string;
}

export class RefreshTokenUseCase {
  constructor(
    private readonly userRepo: IAuthUserRepository,
    private readonly tokenService: ITokenService,
    private readonly logger: Logger,
  ) {}

  async execute(refreshToken: string): Promise<RefreshTokenOutput> {
    this.logger.debug('RefreshToken: verifying refresh token');
    const payload = await this.tokenService.verifyRefreshToken(refreshToken);
    this.logger.debug({ userId: payload.sub }, 'RefreshToken: token verified, looking up user');

    const user = await this.userRepo.findById(payload.sub);
    if (!user) {
      this.logger.warn({ userId: payload.sub }, 'RefreshToken: user not found for valid token');
      throw new UnauthorizedError('User not found');
    }
    this.logger.debug({ userId: user.id }, 'RefreshToken: revoking old token');

    await this.tokenService.revokeRefreshToken(refreshToken);
    this.logger.debug({ userId: user.id }, 'RefreshToken: old token revoked');

    this.logger.debug({ userId: user.id }, 'RefreshToken: generating new token pair');
    const tokens = await this.tokenService.generateTokenPair(
      user.id,
      user.email,
      user.subscriptionTier,
    );

    this.logger.info({ userId: user.id }, 'RefreshToken: token pair rotated successfully');
    return { userId: user.id, ...tokens };
  }
}
