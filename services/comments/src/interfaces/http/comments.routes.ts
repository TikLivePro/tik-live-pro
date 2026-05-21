import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

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
    receivedAt: {
      type: 'string',
      format: 'date-time',
      description: 'ISO 8601 timestamp of when the comment was received by the poller.',
    },
  },
};

// ---------------------------------------------------------------------------

export function registerCommentsRoutes(fastify: FastifyInstance, _deps: { db: NodePgDatabase }): void {
  // GET /comments ------------------------------------------------------------
  fastify.get(
    '/comments',
    {
      schema: {
        tags: ['Comments'],
        summary: 'List comments for a session',
        description: `
Returns a paginated list of comments aggregated across all streaming platforms for a specific live session.

Comments are collected by the \`CommentPoller\` which calls each platform's comment API on a configurable interval (default: every 2 seconds per platform). They are stored in Postgres and also published as \`comment.received\` NATS events for real-time consumption.

**Real-time alternative:** for live comment feeds, connect to the WebSocket endpoint \`ws://<host>/comments/ws?sessionId=<id>\` — it pushes comments as they arrive, with no polling needed.

**Pagination:** results are ordered by \`receivedAt\` ascending (oldest first) by default. Use \`cursor\` for efficient keyset pagination on large datasets.
        `.trim(),
        security: bearerAuth,
        querystring: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: {
              type: 'string',
              format: 'uuid',
              description: 'The live session to fetch comments for.',
              example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            },
            platform: {
              type: 'string',
              enum: ['tiktok', 'facebook'],
              description: 'Filter by platform. Omit to return comments from all platforms.',
            },
            page: {
              type: 'integer',
              minimum: 1,
              default: 1,
              description: 'Page number (1-based offset pagination).',
            },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 50,
              description: 'Number of comments per page. Maximum 100.',
            },
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
                  items: {
                    type: 'array',
                    items: commentSchema,
                  },
                  total: {
                    type: 'integer',
                    description: 'Total number of comments for this session (across all platforms).',
                    example: 1234,
                  },
                  page: { type: 'integer', example: 1 },
                  pageSize: { type: 'integer', example: 50 },
                  hasNextPage: { type: 'boolean', example: true },
                },
              },
            },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
          404: errorSchema('Session not found or does not belong to the authenticated user.'),
          422: errorSchema('Validation error — missing or invalid query parameters.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({
        data: { items: [], total: 0, page: 1, pageSize: 50, hasNextPage: false },
      });
    },
  );

  // GET /comments/ws (WebSocket — documented for reference) ------------------
  fastify.get(
    '/comments/ws',
    {
      schema: {
        tags: ['Comments'],
        summary: 'Real-time comment stream (WebSocket)',
        description: `
Opens a WebSocket connection that pushes comments in real time as they are received from TikTok and Facebook.

**Connection:**
\`\`\`
ws://<host>/comments/ws?sessionId=<sessionId>
\`\`\`
Include the Bearer token in the \`Authorization\` header or as the \`token\` query parameter (browser WebSocket APIs do not support custom headers).

**Message format (server → client):**
\`\`\`json
{
  "type": "comment",
  "data": {
    "id": "uuid",
    "platform": "tiktok",
    "authorName": "Bob Viewer",
    "content": "Great stream!",
    "receivedAt": "2026-05-19T10:00:00.000Z"
  }
}
\`\`\`

**Connection lifecycle:**
- The server sends a \`ping\` frame every 30 s.
- If the session ends, the server sends \`{ "type": "session_ended" }\` and closes the connection.
        `.trim(),
        security: bearerAuth,
        querystring: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: {
              type: 'string',
              format: 'uuid',
              description: 'Live session to stream comments from.',
            },
            token: {
              type: 'string',
              description: 'JWT access token (alternative to Authorization header, for browser WebSocket clients).',
            },
          },
        },
        response: {
          101: { description: 'Switching Protocols — WebSocket connection established.' },
          401: errorSchema('Missing or invalid Bearer token.'),
          404: errorSchema('Session not found.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(101).send();
    },
  );
}
