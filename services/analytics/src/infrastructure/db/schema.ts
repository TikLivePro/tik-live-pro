import { pgTable, text, timestamp, uuid, integer, real, index, unique } from 'drizzle-orm/pg-core';

export const analyticsSessions = pgTable(
  'analytics_sessions',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id').notNull().unique(),
    userId: uuid('user_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds'),
    totalComments: integer('total_comments').notNull().default(0),
    finalStatus: text('final_status'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('analytics_sessions_user_id_idx').on(t.userId),
  }),
);

export const streamHealthSamples = pgTable(
  'stream_health_samples',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id').notNull(),
    sampledAt: timestamp('sampled_at', { withTimezone: true }).notNull().defaultNow(),
    bitrateKbps: integer('bitrate_kbps').notNull(),
    fps: real('fps').notNull(),
    droppedFrames: integer('dropped_frames').notNull().default(0),
    latencyMs: integer('latency_ms'),
  },
  (t) => ({
    sessionTimeIdx: index('stream_health_session_time_idx').on(t.sessionId, t.sampledAt),
  }),
);

export const analyticsPlatformStats = pgTable(
  'analytics_platform_stats',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id').notNull(),
    platform: text('platform').notNull(),
    commentCount: integer('comment_count').notNull().default(0),
    avgBitrateKbps: integer('avg_bitrate_kbps'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionPlatformUniq: unique('analytics_platform_stats_session_platform_uniq').on(
      t.sessionId,
      t.platform,
    ),
  }),
);
