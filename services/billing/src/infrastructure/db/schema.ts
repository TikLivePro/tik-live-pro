import { pgTable, text, timestamp, varchar, uuid, integer, boolean, jsonb } from 'drizzle-orm/pg-core';

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey(),
  slug: varchar('slug', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 50 }).notNull(),
  priceCents: integer('price_cents').notNull().default(0),
  features: jsonb('features').notNull().default([]),
  maxSocialAccounts: integer('max_social_accounts'),
  stripePriceId: text('stripe_price_id'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().unique(),
  tier: varchar('tier', { length: 20 }).notNull().default('free'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
