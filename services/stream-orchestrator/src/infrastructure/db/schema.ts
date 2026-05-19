import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const streamSessions = pgTable('stream_sessions', {
  sessionId: uuid('session_id').primaryKey(),
  userId: uuid('user_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('idle'),
  pendingAccountIds: jsonb('pending_account_ids').$type<string[]>().notNull(),
  ingestKey: text('ingest_key').unique(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const streamDestinations = pgTable('stream_destinations', {
  id: uuid('id').primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => streamSessions.sessionId, { onDelete: 'cascade' }),
  socialAccountId: text('social_account_id').notNull(),
  platform: text('platform').notNull(),
  rtmpUrl: text('rtmp_url'),
  streamKey: text('stream_key'),
  platformStreamId: text('platform_stream_id'),
  streamKeyExpiresAt: timestamp('stream_key_expires_at', { withTimezone: true }),
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
