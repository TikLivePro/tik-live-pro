import {
  pgTable,
  text,
  timestamp,
  varchar,
  uuid,
  boolean,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('notifications_user_id_idx').on(t.userId),
    unreadIdx: index('notifications_user_unread_idx').on(t.userId, t.isRead),
  }),
);
