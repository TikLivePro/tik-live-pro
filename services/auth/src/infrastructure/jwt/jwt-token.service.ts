import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, gt } from 'drizzle-orm';
import type { ITokenService, TokenPair, TokenPayload } from '../../domain/services/token.service.js';
import { UnauthorizedError } from '@tik-live-pro/domain';
import { refreshTokens } from '../db/schema.js';
import type { UserId } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';

export class JwtTokenService implements ITokenService {
  constructor(
    private readonly fastify: FastifyInstance,
    private readonly db: NodePgDatabase,
    private readonly accessExpiresIn: string,
    private readonly refreshExpiresIn: string,
    private readonly logger: Logger,
  ) {}

  async generateTokenPair(userId: UserId, email: string, tier: string): Promise<TokenPair> {
    this.logger.debug({ userId, tier }, 'JwtTokenService: signing access token');
    const accessToken = await this.fastify.jwt.sign(
      { sub: userId, email, tier },
      { expiresIn: this.accessExpiresIn },
    );
    this.logger.debug({ userId }, 'JwtTokenService: access token signed');

    const rawRefreshToken = randomUUID();
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

    const expiresAt = new Date();
    const daysMatch = this.refreshExpiresIn.match(/^(\d+)d$/);
    const days = daysMatch && daysMatch[1] ? parseInt(daysMatch[1], 10) : 30;
    expiresAt.setDate(expiresAt.getDate() + days);

    this.logger.debug({ userId, expiresAt }, 'JwtTokenService: storing refresh token');
    await this.db.insert(refreshTokens).values({
      id: randomUUID(),
      userId,
      tokenHash,
      expiresAt,
    });
    this.logger.debug({ userId }, 'JwtTokenService: refresh token stored');

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900,
    };
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    this.logger.debug('JwtTokenService: verifying access token');
    try {
      const payload = await this.fastify.jwt.verify<TokenPayload>(token);
      this.logger.debug({ userId: payload.sub }, 'JwtTokenService: access token valid');
      return payload;
    } catch {
      this.logger.warn('JwtTokenService: access token invalid or expired');
      throw new UnauthorizedError('Invalid or expired access token');
    }
  }

  async verifyRefreshToken(token: string): Promise<TokenPayload> {
    this.logger.debug('JwtTokenService: verifying refresh token against DB');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();

    const rows = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, now),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      this.logger.warn('JwtTokenService: refresh token not found, expired, or revoked');
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
    this.logger.debug({ userId: row.userId }, 'JwtTokenService: refresh token valid');

    return { sub: row.userId as UserId, email: '', tier: '', iat: 0, exp: 0 };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    this.logger.debug('JwtTokenService: revoking refresh token');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));
    this.logger.debug('JwtTokenService: refresh token revoked');
  }
}
