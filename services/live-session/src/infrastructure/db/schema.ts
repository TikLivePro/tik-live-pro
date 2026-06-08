import { pgTable, text, timestamp, jsonb, uuid, index, boolean } from 'drizzle-orm/pg-core';

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
    shouldRecord: boolean('should_record').notNull().default(false),
    viewersVisible: boolean('viewers_visible').notNull().default(false),
    allowViewerVideoControl: boolean('allow_viewer_video_control').notNull().default(false),
    platformHlsUrl: text('platform_hls_url'),
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
