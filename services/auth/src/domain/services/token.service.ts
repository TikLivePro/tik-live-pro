import type { UserId } from '@tik-live-pro/shared-types';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenPayload {
  sub: UserId;
  email: string;
  tier: string;
  iat: number;
  exp: number;
}

export interface ITokenService {
  generateTokenPair(userId: UserId, email: string, tier: string): Promise<TokenPair>;
  verifyAccessToken(token: string): Promise<TokenPayload>;
  verifyRefreshToken(token: string): Promise<TokenPayload>;
  revokeRefreshToken(token: string): Promise<void>;
}
