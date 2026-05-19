import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

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

const sessionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Unique session identifier.' },
    userId: { type: 'string', format: 'uuid', description: 'Owner user ID.' },
    title: { type: 'string', description: 'Session display title.', example: 'Morning coding stream' },
    description: { type: 'string', nullable: true, description: 'Optional session description.' },
    status: {
      type: 'string',
      enum: ['created', 'starting', 'live', 'paused', 'ending', 'ended', 'error'],
      description: 'Current lifecycle status of the session.',
      example: 'live',
    },
    destinations: {
      type: 'array',
      description: 'Target social accounts this session streams to.',
      items: {
        type: 'object',
        properties: {
          socialAccountId: { type: 'string', format: 'uuid' },
          platform: { type: 'string', enum: ['tiktok', 'facebook'] },
          status: { type: 'string', enum: ['pending', 'connecting', 'live', 'error', 'ended'] },
        },
      },
    },
    startedAt: { type: 'string', format: 'date-time', nullable: true },
    endedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

// ---------------------------------------------------------------------------
// Zod validators (runtime)
// ---------------------------------------------------------------------------

const createSessionBody = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  destinationAccountIds: z.array(z.string().uuid()).min(1),
});

// ---------------------------------------------------------------------------

export function registerLiveSessionRoutes(fastify: FastifyInstance): void {
  // POST /sessions -----------------------------------------------------------
  fastify.post(
    '/sessions',
    {
      schema: {
        tags: ['Live Sessions'],
        summary: 'Create a live session',
        description: `
Creates a new live session that will broadcast simultaneously to one or more connected social accounts.

**Constraints:**
- A user may have only one active session at a time (status ≠ \`ended\` / \`error\`).
- All \`destinationAccountIds\` must belong to the authenticated user.
- The session starts in the \`created\` state. Call \`POST /sessions/{sessionId}/start\` to begin broadcasting.

**Side effects:**
- A \`session.created\` NATS event is published, which the \`stream-orchestrator\` consumes to pre-allocate an RTMP ingest slot.
        `.trim(),
        security: bearerAuth,
        body: {
          type: 'object',
          required: ['title', 'destinationAccountIds'],
          additionalProperties: false,
          properties: {
            title: {
              type: 'string',
              minLength: 1,
              maxLength: 100,
              description: 'Display title shown in the streaming platform UI.',
              example: 'Morning coding stream',
            },
            description: {
              type: 'string',
              maxLength: 500,
              description: 'Optional longer description for the stream.',
              example: 'Building a live streaming platform — live!',
            },
            destinationAccountIds: {
              type: 'array',
              minItems: 1,
              description: 'UUIDs of connected social accounts to stream to. Must all belong to the authenticated user.',
              items: { type: 'string', format: 'uuid' },
              example: ['c3d4e5f6-a7b8-9012-cdef-123456789012'],
            },
          },
        },
        response: {
          201: {
            description: 'Session created successfully.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['sessionId'],
                properties: {
                  sessionId: {
                    type: 'string',
                    format: 'uuid',
                    description: 'ID of the newly created session.',
                    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
                  },
                },
              },
            },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
          409: errorSchema('User already has an active session.'),
          422: errorSchema('Validation error — request body failed schema checks.'),
        },
      },
    },
    async (request, reply) => {
      const body = createSessionBody.parse(request.body);
      const userId = (request as { user?: { sub?: string } }).user?.sub ?? '';
      const correlationId = (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();
      void body; void userId; void correlationId;
      return reply.status(201).send({ data: { sessionId: crypto.randomUUID() } });
    },
  );

  // GET /sessions/:sessionId -------------------------------------------------
  fastify.get<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId',
    {
      schema: {
        tags: ['Live Sessions'],
        summary: 'Get session details',
        description: `
Returns the full state of a live session, including its current status, destination platforms, and timestamps.

**Status lifecycle:**
\`created\` → \`starting\` → \`live\` → \`ending\` → \`ended\`

A session can also transition to \`error\` at any point if a fatal problem occurs (e.g., all platform streams fail).
        `.trim(),
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: {
              type: 'string',
              format: 'uuid',
              description: 'Live session ID.',
              example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            },
          },
        },
        response: {
          200: {
            description: 'Session details.',
            type: 'object',
            required: ['data'],
            properties: { data: sessionSchema },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
          403: errorSchema('Session belongs to a different user.'),
          404: errorSchema('Session not found.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
    },
  );

  // POST /sessions/:sessionId/start -----------------------------------------
  fastify.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/start',
    {
      schema: {
        tags: ['Live Sessions'],
        summary: 'Start a session',
        description: `
Transitions the session from \`created\` → \`starting\` and emits a \`session.starting\` NATS event to trigger multi-platform broadcast initialization.

**After calling this:**
1. Poll \`GET /sessions/{sessionId}\` until status is \`live\`.
2. Retrieve the RTMP ingest URL from the \`stream-orchestrator\` via \`GET /stream/sessions/{sessionId}/ingest\`.
3. Point your broadcasting client at the RTMP URL and begin streaming.

**Idempotency:** calling this on an already-starting or live session returns HTTP 409.
        `.trim(),
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: {
              type: 'string',
              format: 'uuid',
              description: 'Live session ID.',
              example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            },
          },
        },
        response: {
          204: { description: 'Session is starting. No response body.' },
          401: errorSchema('Missing or invalid Bearer token.'),
          403: errorSchema('Session belongs to a different user.'),
          404: errorSchema('Session not found.'),
          409: errorSchema('Session is not in `created` status — it may already be starting or live.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(204).send();
    },
  );

  // POST /sessions/:sessionId/end -------------------------------------------
  fastify.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/end',
    {
      schema: {
        tags: ['Live Sessions'],
        summary: 'End a session',
        description: `
Gracefully terminates the live session: transitions to \`ending\`, stops all ffmpeg broadcast workers, and finalizes the stream on each platform.

**Side effects:**
- A \`session.ending\` NATS event is emitted.
- The \`stream-orchestrator\` stops ffmpeg workers and calls the platform stop APIs.
- Analytics ingestion is finalized.
- Destination statuses are set to \`ended\`.

**Note:** Stopping the RTMP feed without calling this endpoint will cause the session to stay in \`live\` state. Always call this endpoint to properly end a session.
        `.trim(),
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: {
              type: 'string',
              format: 'uuid',
              description: 'Live session ID.',
              example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            },
          },
        },
        response: {
          204: { description: 'Session ending. No response body.' },
          401: errorSchema('Missing or invalid Bearer token.'),
          403: errorSchema('Session belongs to a different user.'),
          404: errorSchema('Session not found.'),
          409: errorSchema('Session is not in `live` or `starting` status.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(204).send();
    },
  );
}
