import { pgTable, text, timestamp, varchar, uuid, unique, index, jsonb, integer } from 'drizzle-orm/pg-core';

// Highest concurrent viewer count ever observed for a session. Written by the
// Socket.io viewer registry (debounced broadcast path); read by the dashboard
// stats ("Peak Viewers" tile, Recent Sessions viewers column).
export const viewerPeaks = pgTable('viewer_peaks', {
  sessionId: uuid('session_id').primaryKey(),
  peakViewers: integer('peak_viewers').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reactions = pgTable(
  'reactions',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id').notNull(),
    emoji: varchar('emoji', { length: 10 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('reactions_session_id_idx').on(t.sessionId),
    // Matches the GET /comments/reactions replay query (WHERE session_id
    // ORDER BY created_at LIMIT n) — avoids sorting a busy session's full
    // reaction history on every replay load.
    sessionCreatedIdx: index('reactions_session_created_idx').on(t.sessionId, t.createdAt),
  }),
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id').notNull(),
    platform: varchar('platform', { length: 20 }).notNull(),
    platformCommentId: varchar('platform_comment_id', { length: 255 }).notNull(),
    authorName: varchar('author_name', { length: 255 }).notNull(),
    authorPlatformUserId: varchar('author_platform_user_id', { length: 255 }).notNull().default(''),
    authorAvatarUrl: text('author_avatar_url'),
    content: text('content').notNull(),
    mediaUrls: jsonb('media_urls').$type<string[]>(),
    replyToCommentId: uuid('reply_to_comment_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('comments_session_id_idx').on(t.sessionId),
    // Matches the GET /comments hot query exactly (WHERE session_id ORDER BY
    // received_at DESC LIMIT n) — avoids a sort over every comment of a busy
    // session each time a viewer loads history.
    sessionReceivedIdx: index('comments_session_received_idx').on(t.sessionId, t.receivedAt.desc()),
    dedupeUniq: unique('comments_dedupe_uniq').on(t.sessionId, t.platform, t.platformCommentId),
  }),
);
