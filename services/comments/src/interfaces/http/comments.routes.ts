import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Server as SocketIOServer } from 'socket.io';
import { eq, desc, count, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { comments } from '../../infrastructure/db/schema.js';
import type { CommentPoster } from '../../application/comment-poster.js';
import type { Comment } from '@tik-live-pro/shared-types';

// ---------------------------------------------------------------------------
// Reusable schema fragments
// ---------------------------------------------------------------------------

const bearerAuth = [{ BearerAuth: [] }];

const errorSchema = (description: string) => ({
  description,
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', description: 'Machine-readable error code.', example: 'NOT_FOUND' },
        message: { type: 'string', description: 'Human-readable error message.', example: 'Session not found' },
      },
    },
  },
});

const commentSchema = {
  type: 'object',
  description: 'A single comment received from a social platform during a live session.',
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Internal comment ID.' },
    sessionId: { type: 'string', format: 'uuid', description: 'ID of the live session this comment belongs to.' },
    platform: {
      type: 'string',
      enum: ['tiktok', 'facebook'],
      description: 'Platform the comment originated from.',
      example: 'tiktok',
    },
    platformCommentId: {
      type: 'string',
      description: 'Original comment ID assigned by the platform. Used for deduplication.',
      example: 'tiktok_comment_7abc123',
    },
    authorName: {
      type: 'string',
      description: 'Display name of the comment author as reported by the platform.',
      example: 'Bob Viewer',
    },
    authorPlatformUserId: {
      type: 'string',
      description: 'Platform-assigned user ID of the comment author. Used for reply routing.',
      example: 'tiktok_user_abc123',
    },
    authorAvatarUrl: {
      type: 'string',
      format: 'uri',
      nullable: true,
      description: 'Avatar URL of the comment author, or null if not available.',
      example: 'https://p16-sign.tiktokcdn.com/avatar/abc.jpg',
    },
    content: {
      type: 'string',
      description: 'Comment text content.',
      example: 'Great stream! Keep it up 🔥',
    },
    replyToCommentId: {
      type: 'string',
      format: 'uuid',
      nullable: true,
      description: 'ID of the parent comment if this is a reply.',
    },
    receivedAt: {
      type: 'string',
      format: 'date-time',
      description: 'ISO 8601 timestamp of when the comment was received by the poller.',
    },
  },
};

// ---------------------------------------------------------------------------
// Socket.io instance — set once at startup
// ---------------------------------------------------------------------------
let io: SocketIOServer | null = null;

export function setIo(socketIo: SocketIOServer): void {
  io = socketIo;
}

export function broadcastComment(sessionId: string, comment: Comment): void {
  io?.to(sessionId).emit('comment', comment);
}

// ---------------------------------------------------------------------------

export function registerCommentsRoutes(
  fastify: FastifyInstance,
  deps: { db: NodePgDatabase; poster: CommentPoster },
): void {
  // GET /comments ------------------------------------------------------------
  fastify.get<{
    Querystring: { sessionId: string; platform?: string; page?: number; pageSize?: number };
  }>(
    '/comments',
    {
      schema: {
        tags: ['Comments'],
        summary: 'List comments for a session',
        description: `
Returns a paginated list of comments aggregated across all streaming platforms for a specific live session.

Comments are collected by the \`CommentPoller\` which calls each platform's comment API on a configurable interval (default: every 2 seconds per platform). They are stored in Postgres and also published as \`comment.received\` NATS events for real-time consumption.

**Real-time alternative:** connect to the WebSocket endpoint \`ws://<host>/comments/ws?sessionId=<id>\` — it pushes comments as they arrive.
        `.trim(),
        security: bearerAuth,
        querystring: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'The live session to fetch comments for.' },
            platform: { type: 'string', enum: ['tiktok', 'facebook'], description: 'Filter by platform.' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
        response: {
          200: {
            description: 'Paginated comment list.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['items', 'total', 'page', 'pageSize', 'hasNextPage'],
                properties: {
                  items: { type: 'array', items: commentSchema },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  pageSize: { type: 'integer' },
                  hasNextPage: { type: 'boolean' },
                },
              },
            },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
        },
      },
    },
    async (request, reply) => {
      const { sessionId, platform, page = 1, pageSize = 50 } = request.query;
      const offset = (page - 1) * pageSize;

      const conditions = [eq(comments.sessionId, sessionId)];
      if (platform) conditions.push(eq(comments.platform, platform));
      const where = and(...conditions);

      const [items, [totalRow]] = await Promise.all([
        deps.db
          .select()
          .from(comments)
          .where(where)
          .orderBy(desc(comments.receivedAt))
          .limit(pageSize)
          .offset(offset),
        deps.db.select({ count: count() }).from(comments).where(where),
      ]);

      const total = Number(totalRow?.count ?? 0);
      return reply.status(200).send({
        data: { items, total, page, pageSize, hasNextPage: offset + items.length < total },
      });
    },
  );

  // POST /comments -----------------------------------------------------------
  fastify.post<{ Body: { sessionId: string; content: string; mediaUrls?: string[] } }>(
    '/comments',
    {
      schema: {
        tags: ['Comments'],
        summary: 'Post a comment to all connected platforms',
        description: `
Sends a comment from the authenticated streamer to all social platforms connected to the live session.

The comment is posted via each platform's API using the streamer's OAuth token for that account, then stored locally and pushed in real time to WebSocket subscribers.

Supports an optional \`mediaUrl\` field to attach an image, GIF, or file URL alongside the text.
        `.trim(),
        security: bearerAuth,
        body: {
          type: 'object',
          required: ['sessionId', 'content'],
          additionalProperties: false,
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'ID of the active live session.' },
            content: { type: 'string', minLength: 0, maxLength: 1000, description: 'Comment text to post.' },
            mediaUrls: {
              type: 'array',
              items: { type: 'string', format: 'uri' },
              nullable: true,
              description: 'Optional list of image, GIF, or file URLs to attach.',
            },
          },
        },
        response: {
          201: {
            description: 'Comments posted.',
            type: 'object',
            required: ['data'],
            properties: {
              data: { type: 'array', items: commentSchema },
            },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
          422: errorSchema('Validation error.'),
        },
      },
    },
    async (request, reply) => {
      const { sessionId, content } = request.body;
      const posted = await deps.poster.postToAllPlatforms(
        sessionId as Comment['sessionId'],
        content,
      );

      for (const comment of posted) {
        broadcastComment(sessionId, comment);
      }

      return reply.status(201).send({ data: posted });
    },
  );

  // POST /comments/:commentId/reply ------------------------------------------
  fastify.post<{
    Params: { commentId: string };
    Body: { content: string; mediaUrls?: string[] };
  }>(
    '/comments/:commentId/reply',
    {
      schema: {
        tags: ['Comments'],
        summary: 'Reply to a viewer comment',
        description: `
Replies to a specific comment. The reply is sent to the platform where the original comment came from, using the streamer's OAuth token for that platform's account.

**Platform routing:** the platform is inferred from the parent comment record. If the comment came from TikTok, the reply is posted via the TikTok account connected to the session; likewise for Facebook.
        `.trim(),
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['commentId'],
          properties: {
            commentId: { type: 'string', format: 'uuid', description: 'Internal ID of the comment to reply to.' },
          },
        },
        body: {
          type: 'object',
          required: ['content'],
          additionalProperties: false,
          properties: {
            content: { type: 'string', minLength: 0, maxLength: 1000, description: 'Reply text.' },
            mediaUrls: {
              type: 'array',
              items: { type: 'string', format: 'uri' },
              nullable: true,
              description: 'Optional list of image, GIF, or file URLs to attach.',
            },
          },
        },
        response: {
          201: {
            description: 'Reply posted.',
            type: 'object',
            required: ['data'],
            properties: {
              data: commentSchema,
            },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
          404: errorSchema('Parent comment not found.'),
          422: errorSchema('Validation error.'),
        },
      },
    },
    async (request, reply) => {
      const { commentId } = request.params;
      const { content } = request.body;

      const [parentComment] = await deps.db
        .select()
        .from(comments)
        .where(eq(comments.id, commentId))
        .limit(1);

      if (!parentComment) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Comment not found' } });
      }

      const replyComment = await deps.poster.replyToPlatformComment(
        parentComment.sessionId as Comment['sessionId'],
        parentComment.platform as Comment['platform'],
        commentId,
        parentComment.platformCommentId,
        parentComment.authorPlatformUserId,
        content,
      );

      if (!replyComment) {
        return reply.status(422).send({
          error: { code: 'UNPROCESSABLE', message: 'No account available for this platform in the active session' },
        });
      }

      // Persist the reply
      const id = randomUUID();
      await deps.db.insert(comments).values({
        id,
        sessionId: parentComment.sessionId,
        platform: replyComment.platform,
        platformCommentId: replyComment.platformCommentId,
        authorName: replyComment.authorName,
        authorPlatformUserId: replyComment.authorPlatformUserId,
        authorAvatarUrl: replyComment.authorAvatarUrl,
        content: replyComment.content,
        replyToCommentId: commentId,
        receivedAt: replyComment.receivedAt,
      }).onConflictDoNothing();

      const saved = { ...replyComment, id: id as Comment['id'], replyToCommentId: commentId as Comment['id'] };
      broadcastComment(parentComment.sessionId, saved);

      return reply.status(201).send({ data: saved });
    },
  );

}
