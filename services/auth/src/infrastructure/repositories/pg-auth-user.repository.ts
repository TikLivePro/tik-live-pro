import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.js';
import { AuthUser } from '../../domain/entities/auth-user.entity.js';
import { authUsers } from '../db/schema.js';
import type { Email, UserId, SubscriptionTier } from '@tik-live-pro/shared-types';

export class PgAuthUserRepository implements IAuthUserRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async findById(id: UserId): Promise<AuthUser | null> {
    const rows = await this.db.select().from(authUsers).where(eq(authUsers.id, id)).limit(1);
    const row = rows[0];
    return row ? this.toEntity(row) : null;
  }

  async findByEmail(email: Email): Promise<AuthUser | null> {
    const rows = await this.db.select().from(authUsers).where(eq(authUsers.email, email)).limit(1);
    const row = rows[0];
    return row ? this.toEntity(row) : null;
  }

  async save(user: AuthUser): Promise<void> {
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
  }

  async update(user: AuthUser): Promise<void> {
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
  }

  async delete(id: UserId): Promise<void> {
    await this.db.delete(authUsers).where(eq(authUsers.id, id));
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
