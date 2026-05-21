import {
  pgTable,
  text,
  timestamp,
  varchar,
  uuid,
  boolean,
  unique,
  index,
} from 'drizzle-orm/pg-core';

export const socialAccounts = pgTable(
  'social_accounts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    platform: varchar('platform', { length: 20 }).notNull(),
    platformUserId: varchar('platform_user_id', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    avatarUrl: text('avatar_url'),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePlatformUser: unique('social_accounts_platform_user_uniq').on(t.platform, t.platformUserId),
    userIdx: index('social_accounts_user_id_idx').on(t.userId),
  }),
);

export const oauthStates = pgTable('oauth_states', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id'),
  platform: varchar('platform', { length: 20 }).notNull(),
  state: text('state').notNull().unique(),
  codeVerifier: text('code_verifier'),
  redirectUri: text('redirect_uri').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
