import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import type {
  IAuthUserRepository,
  OAuthAccountData,
} from '../../domain/repositories/auth-user.repository.js';
import { AuthUser } from '../../domain/entities/auth-user.entity.js';
import { authUsers, oauthAccounts } from '../db/schema.js';
import type { Email, UserId, SubscriptionTier } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';

export class PgAuthUserRepository implements IAuthUserRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger,
  ) {}

  async findById(id: UserId): Promise<AuthUser | null> {
    this.logger.debug({ userId: id }, 'PgAuthUserRepository: findById');
    const rows = await this.db.select().from(authUsers).where(eq(authUsers.id, id)).limit(1);
    const row = rows[0];
    const result = row ? this.toEntity(row) : null;
    this.logger.debug({ userId: id, found: result !== null }, 'PgAuthUserRepository: findById done');
    return result;
  }

  async findByEmail(email: Email): Promise<AuthUser | null> {
    this.logger.debug({ email }, 'PgAuthUserRepository: findByEmail');
    const rows = await this.db.select().from(authUsers).where(eq(authUsers.email, email)).limit(1);
    const row = rows[0];
    const result = row ? this.toEntity(row) : null;
    this.logger.debug({ email, found: result !== null }, 'PgAuthUserRepository: findByEmail done');
    return result;
  }

  async save(user: AuthUser): Promise<void> {
    this.logger.debug({ userId: user.id, email: user.email }, 'PgAuthUserRepository: save');
    await this.db.insert(authUsers).values({
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      displayName: user.displayName,
      subscriptionTier: user.subscriptionTier,
      locale: user.locale,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    this.logger.debug({ userId: user.id }, 'PgAuthUserRepository: save done');
  }

  async update(user: AuthUser): Promise<void> {
    this.logger.debug({ userId: user.id }, 'PgAuthUserRepository: update');
    await this.db
      .update(authUsers)
      .set({
        email: user.email,
        passwordHash: user.passwordHash,
        displayName: user.displayName,
        subscriptionTier: user.subscriptionTier,
        locale: user.locale,
        isVerified: user.isVerified,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, user.id));
    this.logger.debug({ userId: user.id }, 'PgAuthUserRepository: update done');
  }

  async delete(id: UserId): Promise<void> {
    this.logger.debug({ userId: id }, 'PgAuthUserRepository: delete');
    await this.db.delete(authUsers).where(eq(authUsers.id, id));
    this.logger.debug({ userId: id }, 'PgAuthUserRepository: delete done');
  }

  async findByOAuthAccount(provider: string, providerUserId: string): Promise<AuthUser | null> {
    this.logger.debug({ provider, providerUserId }, 'PgAuthUserRepository: findByOAuthAccount');
    const rows = await this.db
      .select({ user: authUsers })
      .from(authUsers)
      .innerJoin(oauthAccounts, eq(oauthAccounts.userId, authUsers.id))
      .where(
        and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerUserId, providerUserId),
        ),
      )
      .limit(1);
    const row = rows[0];
    const result = row ? this.toEntity(row.user) : null;
    this.logger.debug({ provider, providerUserId, found: result !== null }, 'PgAuthUserRepository: findByOAuthAccount done');
    return result;
  }

  async saveOAuthAccount(account: OAuthAccountData): Promise<void> {
    this.logger.debug({ provider: account.provider, userId: account.userId }, 'PgAuthUserRepository: saveOAuthAccount');
    await this.db.insert(oauthAccounts).values({
      id: account.id,
      userId: account.userId,
      provider: account.provider,
      providerUserId: account.providerUserId,
      providerEmail: account.providerEmail,
    });
    this.logger.debug({ provider: account.provider }, 'PgAuthUserRepository: saveOAuthAccount done');
  }

  async deleteOAuthAccount(provider: string, providerUserId: string): Promise<void> {
    this.logger.debug({ provider, providerUserId }, 'PgAuthUserRepository: deleteOAuthAccount');
    await this.db
      .delete(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerUserId, providerUserId)));
    this.logger.debug({ provider, providerUserId }, 'PgAuthUserRepository: deleteOAuthAccount done');
  }

  private toEntity(row: typeof authUsers.$inferSelect): AuthUser {
    return AuthUser.create({
      id: row.id as UserId,
      email: row.email as Email,
      passwordHash: row.passwordHash,
      displayName: row.displayName,
      subscriptionTier: row.subscriptionTier as SubscriptionTier,
      locale: row.locale,
      isVerified: row.isVerified,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
