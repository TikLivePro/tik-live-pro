import { pgTable, text, boolean, timestamp, varchar, unique } from 'drizzle-orm/pg-core';

export const authUsers = pgTable('auth_users', {
  id: text('id').primaryKey(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  avatarUrl: text('avatar_url'),
  subscriptionTier: varchar('subscription_tier', { length: 20 }).notNull().default('free'),
  locale: varchar('locale', { length: 10 }).notNull().default('en'),
  isVerified: boolean('is_verified').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull(),
    providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
    providerEmail: varchar('provider_email', { length: 254 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    uniqueProviderAccount: unique().on(t.provider, t.providerUserId),
  }),
);
