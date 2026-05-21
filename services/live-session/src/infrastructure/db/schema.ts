import { pgTable, text, timestamp, jsonb, uuid, index } from 'drizzle-orm/pg-core';

interface StoredDestination {
  socialAccountId: string;
  platform: string;
  streamKey: string;
  rtmpUrl: string;
  status: string;
}

export const liveSessions = pgTable(
  'live_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('created'),
    destinations: jsonb('destinations').$type<StoredDestination[]>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('live_sessions_user_id_idx').on(t.userId),
    statusIdx: index('live_sessions_status_idx').on(t.status),
  }),
);
