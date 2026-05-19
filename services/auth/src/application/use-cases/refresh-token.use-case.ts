import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.js';
import type { ITokenService, TokenPair } from '../../domain/services/token.service.js';
import { UnauthorizedError } from '@tik-live-pro/domain';

export interface RefreshTokenOutput extends TokenPair {
  userId: string;
}

export class RefreshTokenUseCase {
  constructor(
    private readonly userRepo: IAuthUserRepository,
    private readonly tokenService: ITokenService,
  ) {}

  async execute(refreshToken: string): Promise<RefreshTokenOutput> {
    const payload = await this.tokenService.verifyRefreshToken(refreshToken);
    const user = await this.userRepo.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    await this.tokenService.revokeRefreshToken(refreshToken);

    const tokens = await this.tokenService.generateTokenPair(
      user.id,
      user.email,
      user.subscriptionTier,
    );

    return { userId: user.id, ...tokens };
  }
}
