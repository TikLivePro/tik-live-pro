import { pgTable, text, timestamp, varchar, uuid, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  avatarUrl: text('avatar_url'),
  subscriptionTier: varchar('subscription_tier', { length: 20 }).notNull().default('free'),
  locale: varchar('locale', { length: 10 }).notNull().default('en'),
  socialAccountCount: integer('social_account_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
