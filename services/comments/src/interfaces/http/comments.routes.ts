import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Server as SocketIOServer } from 'socket.io';
import { eq, desc, asc, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { comments, reactions, viewerPeaks } from '../../infrastructure/db/schema.js';
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
      enum: ['tiktok', 'facebook', 'local'],
      description: 'Platform the comment originated from. "local" means posted without a linked platform account.',
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
    mediaUrls: {
      type: 'array',
      items: { type: 'string', format: 'uri' },
      nullable: true,
      description: 'Optional list of image, GIF, or file URLs attached to the comment.',
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

export function broadcastReaction(sessionId: string, emoji: string): void {
  io?.to(sessionId).emit('reaction', { emoji });
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

      // Fetch one extra row to derive hasNextPage without a COUNT(*) — on a
      // busy session the count over 100k+ rows dominates the query cost, and
      // every viewer hits this endpoint at go-live. `total` is a lower bound;
      // no client renders it.
      const rows = await deps.db
        .select()
        .from(comments)
        .where(where)
        .orderBy(desc(comments.receivedAt))
        .limit(pageSize + 1)
        .offset(offset);

      const hasNextPage = rows.length > pageSize;
      const items = hasNextPage ? rows.slice(0, pageSize) : rows;
      return reply.status(200).send({
        data: { items, total: offset + rows.length, page, pageSize, hasNextPage },
      });
    },
  );

  // GET /comments/reactions ----------------------------------------------------
  fastify.get<{
    Querystring: { sessionId: string; page?: number; pageSize?: number };
  }>(
    '/comments/reactions',
    {
      schema: {
        tags: ['Comments'],
        summary: 'List emoji reactions for a session',
        description: `
Returns the persisted emoji reactions of a live session in **chronological order** (oldest first), with the exact timestamp each reaction was sent.

Reactions are recorded by the Socket.io \`emit_reaction\` handler (rate-limited per socket and per session) as they happen during the live. This endpoint is the read side, used by the session **replay** view to show the reaction history alongside the comment history.

Publicly readable — replay pages are accessible to unauthenticated viewers, same as \`GET /comments\`.
        `.trim(),
        querystring: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'The live session to fetch reactions for.' },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
          },
        },
        response: {
          200: {
            description: 'Paginated reaction list, oldest first.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['items', 'page', 'pageSize', 'hasNextPage'],
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      description: 'A single emoji reaction sent by a viewer during the live session.',
                      properties: {
                        id: { type: 'string', format: 'uuid', description: 'Internal reaction ID.' },
                        sessionId: { type: 'string', format: 'uuid', description: 'ID of the live session.' },
                        emoji: { type: 'string', description: 'The reaction emoji.', example: '❤️' },
                        createdAt: {
                          type: 'string',
                          format: 'date-time',
                          description: 'ISO 8601 timestamp of the exact moment the reaction was sent.',
                        },
                      },
                    },
                  },
                  page: { type: 'integer' },
                  pageSize: { type: 'integer' },
                  hasNextPage: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { sessionId, page = 1, pageSize = 200 } = request.query;
      const offset = (page - 1) * pageSize;

      // limit+1 instead of COUNT(*) — same trade-off as GET /comments.
      const rows = await deps.db
        .select()
        .from(reactions)
        .where(eq(reactions.sessionId, sessionId))
        .orderBy(asc(reactions.createdAt))
        .limit(pageSize + 1)
        .offset(offset);

      const hasNextPage = rows.length > pageSize;
      const items = hasNextPage ? rows.slice(0, pageSize) : rows;
      return reply.status(200).send({ data: { items, page, pageSize, hasNextPage } });
    },
  );

  // GET /comments/viewer-stats -------------------------------------------------
  fastify.get<{
    Querystring: { sessionIds: string };
  }>(
    '/comments/viewer-stats',
    {
      schema: {
        tags: ['Comments'],
        summary: 'Peak concurrent viewers per session',
        description: `
Returns the highest concurrent viewer count ever observed for each requested session.

Peaks are recorded by the Socket.io viewer registry as viewers join a live session (debounced, monotonic via \`GREATEST\` upsert). Sessions with no recorded peak are omitted from the response.

Publicly readable — the dashboard stats and watch pages consume this without a token, same as \`GET /comments\`.
        `.trim(),
        querystring: {
          type: 'object',
          required: ['sessionIds'],
          properties: {
            sessionIds: {
              type: 'string',
              description: 'Comma-separated list of session UUIDs (max 50).',
              example: 'a1b2c3d4-…,e5f6a7b8-…',
            },
          },
        },
        response: {
          200: {
            description: 'Peak viewer count per session.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['peaks'],
                properties: {
                  peaks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        sessionId: { type: 'string', format: 'uuid' },
                        peakViewers: { type: 'integer', description: 'Highest concurrent viewer count observed.', example: 1204 },
                      },
                    },
                  },
                },
              },
            },
          },
          400: errorSchema('Invalid or too many session IDs.'),
        },
      },
    },
    async (request, reply) => {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const ids = request.query.sessionIds
        .split(',')
        .map((s) => s.trim())
        .filter((s) => UUID_RE.test(s));

      if (ids.length === 0 || ids.length > 50) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'sessionIds must contain 1–50 valid UUIDs' },
        });
      }

      const rows = await deps.db
        .select({ sessionId: viewerPeaks.sessionId, peakViewers: viewerPeaks.peakViewers })
        .from(viewerPeaks)
        .where(inArray(viewerPeaks.sessionId, ids));

      return reply.status(200).send({ data: { peaks: rows } });
    },
  );

  // POST /comments -----------------------------------------------------------
  fastify.post<{ Body: { sessionId: string; content: string; authorName?: string; mediaUrls?: string[] } }>(
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
            authorName: { type: 'string', maxLength: 255, nullable: true, description: 'Display name to use for local comments (when no platform account is linked).' },
            mediaUrls: {
              type: 'array',
              // Each accepted URL is stored inline in Postgres and fanned out
              // over Socket.io to every viewer in the room — an uncapped 1MB
              // base64 data: URI would mean ~1GB of egress at 1,000 viewers.
              maxItems: 4,
              items: { type: 'string', format: 'uri', maxLength: 200_000 },
              nullable: true,
              description: 'Optional list of image, GIF, or file URLs to attach (max 4, ≤200KB each).',
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
      await request.jwtVerify();
      const user = request.user as { sub: string };
      const { sessionId, content, authorName: bodyAuthorName, mediaUrls } = request.body;
      const posted = await deps.poster.postToAllPlatforms(
        sessionId as Comment['sessionId'],
        content,
      );

      if (posted.length > 0) {
        // Persist before broadcasting so the comment survives into history —
        // the poster only publishes to the platform APIs. Re-keyed with a
        // fresh UUID (platform IDs are not UUIDs); the dedupe constraint on
        // (session_id, platform, platform_comment_id) keeps the poller from
        // re-inserting the same comment when it shows up in a later poll.
        const saved = posted.map((comment) => ({
          ...comment,
          id: randomUUID() as Comment['id'],
          ...(mediaUrls?.length ? { mediaUrls } : {}),
        }));
        for (const comment of saved) {
          await deps.db.insert(comments).values({
            id: comment.id,
            sessionId: comment.sessionId,
            platform: comment.platform,
            platformCommentId: comment.platformCommentId,
            authorName: comment.authorName,
            authorPlatformUserId: comment.authorPlatformUserId,
            authorAvatarUrl: comment.authorAvatarUrl ?? null,
            content: comment.content,
            mediaUrls: comment.mediaUrls ?? null,
            receivedAt: new Date(comment.receivedAt),
          }).onConflictDoNothing();
          broadcastComment(sessionId, comment);
        }
        return reply.status(201).send({ data: saved });
      }

      // No linked platform accounts — persist and broadcast a local comment so it
      // appears instantly in the live dashboard.
      const authorName = bodyAuthorName ?? 'Streamer';
      const authorPlatformUserId = user.sub;

      const id = randomUUID();
      const now = new Date();
      await deps.db.insert(comments).values({
        id,
        sessionId,
        platform: 'local',
        platformCommentId: id,
        authorName,
        authorPlatformUserId,
        authorAvatarUrl: null,
        content,
        mediaUrls: mediaUrls ?? null,
        receivedAt: now,
      }).onConflictDoNothing();

      const localComment: Comment = {
        id: id as Comment['id'],
        sessionId: sessionId as Comment['sessionId'],
        platform: 'local',
        platformCommentId: id,
        authorName,
        authorPlatformUserId,
        authorAvatarUrl: null,
        content,
        ...(mediaUrls?.length ? { mediaUrls } : {}),
        receivedAt: now,
      };

      broadcastComment(sessionId, localComment);
      return reply.status(201).send({ data: [localComment] });
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
              // Each accepted URL is stored inline in Postgres and fanned out
              // over Socket.io to every viewer in the room — an uncapped 1MB
              // base64 data: URI would mean ~1GB of egress at 1,000 viewers.
              maxItems: 4,
              items: { type: 'string', format: 'uri', maxLength: 200_000 },
              nullable: true,
              description: 'Optional list of image, GIF, or file URLs to attach (max 4, ≤200KB each).',
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
      await request.jwtVerify();
      const user = request.user as { sub: string };
      const { commentId } = request.params;
      const { content, mediaUrls } = request.body;

      const [parentComment] = await deps.db
        .select()
        .from(comments)
        .where(eq(comments.id, commentId))
        .limit(1);

      if (!parentComment) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Comment not found' } });
      }

      // Local comments are not routed through a social platform — persist a local reply directly.
      if (parentComment.platform === 'local') {
        const authorName = 'Streamer';
        const authorPlatformUserId = user.sub;

        const id = randomUUID();
        const now = new Date();
        await deps.db.insert(comments).values({
          id,
          sessionId: parentComment.sessionId,
          platform: 'local',
          platformCommentId: id,
          authorName,
          authorPlatformUserId,
          authorAvatarUrl: null,
          content,
          mediaUrls: mediaUrls ?? null,
          replyToCommentId: commentId,
          receivedAt: now,
        }).onConflictDoNothing();

        const localReply: Comment = {
          id: id as Comment['id'],
          sessionId: parentComment.sessionId as Comment['sessionId'],
          platform: 'local',
          platformCommentId: id,
          authorName,
          authorPlatformUserId,
          authorAvatarUrl: null,
          content,
          ...(mediaUrls?.length ? { mediaUrls } : {}),
          replyToCommentId: commentId as Comment['id'],
          receivedAt: now,
        };
        broadcastComment(parentComment.sessionId, localReply);
        return reply.status(201).send({ data: localReply });
      }

      const replyComment = await deps.poster.replyToPlatformComment(
        parentComment.sessionId as Comment['sessionId'],
        parentComment.platform as import('@tik-live-pro/shared-types').SocialPlatform,
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
        mediaUrls: mediaUrls ?? null,
        replyToCommentId: commentId,
        receivedAt: replyComment.receivedAt,
      }).onConflictDoNothing();

      const saved = { ...replyComment, id: id as Comment['id'], replyToCommentId: commentId as Comment['id'], ...(mediaUrls?.length ? { mediaUrls } : {}) };
      broadcastComment(parentComment.sessionId, saved);

      return reply.status(201).send({ data: saved });
    },
  );

}
