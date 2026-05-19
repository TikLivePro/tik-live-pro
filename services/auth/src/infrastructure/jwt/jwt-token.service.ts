import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, gt } from 'drizzle-orm';
import type { ITokenService, TokenPair, TokenPayload } from '../../domain/services/token.service.js';
import { UnauthorizedError } from '@tik-live-pro/domain';
import { refreshTokens } from '../db/schema.js';
import type { UserId } from '@tik-live-pro/shared-types';

export class JwtTokenService implements ITokenService {
  constructor(
    private readonly fastify: FastifyInstance,
    private readonly db: NodePgDatabase,
    private readonly accessExpiresIn: string,
  ) {}

  async generateTokenPair(userId: UserId, email: string, tier: string): Promise<TokenPair> {
    const accessToken = await this.fastify.jwt.sign(
      { sub: userId, email, tier },
      { expiresIn: this.accessExpiresIn },
    );

    const rawRefreshToken = randomUUID();
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.db.insert(refreshTokens).values({
      id: randomUUID(),
      userId,
      tokenHash,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900,
    };
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      return await this.fastify.jwt.verify<TokenPayload>(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }
  }

  async verifyRefreshToken(token: string): Promise<TokenPayload> {
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
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    return { sub: row.userId as UserId, email: '', tier: '', iat: 0, exp: 0 };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));
  }
}
