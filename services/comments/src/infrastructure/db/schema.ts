import { pgTable, text, timestamp, varchar, uuid, unique, index } from 'drizzle-orm/pg-core';

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
    replyToCommentId: uuid('reply_to_comment_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('comments_session_id_idx').on(t.sessionId),
    dedupeUniq: unique('comments_dedupe_uniq').on(t.sessionId, t.platform, t.platformCommentId),
  }),
);
