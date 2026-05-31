import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CreateSessionUseCase } from '../../application/use-cases/create-session.use-case.js';
import type { StartSessionUseCase } from '../../application/use-cases/start-session.use-case.js';
import type { EndSessionUseCase } from '../../application/use-cases/end-session.use-case.js';
import type { PauseSessionUseCase } from '../../application/use-cases/pause-session.use-case.js';
import type { ResumeSessionUseCase } from '../../application/use-cases/resume-session.use-case.js';
import type { ILiveSessionRepository } from '../../domain/repositories/live-session.repository.js';
import { NotFoundError, ForbiddenError, ConflictError, DomainError } from '@tik-live-pro/domain';
import type { LiveSessionId, UserId } from '@tik-live-pro/shared-types';

export interface LiveSessionRouteDeps {
  createSession: CreateSessionUseCase;
  startSession: StartSessionUseCase;
  endSession: EndSessionUseCase;
  pauseSession: PauseSessionUseCase;
  resumeSession: ResumeSessionUseCase;
  sessionRepo: ILiveSessionRepository;
  billingServiceUrl?: string;
}

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
      description: 'Target social accounts this session streams to. Empty when going live without connected accounts.',
      items: {
        type: 'object',
        properties: {
          socialAccountId: { type: 'string', format: 'uuid' },
          platform: { type: 'string', enum: ['tiktok', 'facebook', 'platform'] },
          status: { type: 'string', enum: ['pending', 'connecting', 'live', 'error', 'ended'] },
        },
      },
    },
    shouldRecord: {
      type: 'boolean',
      description: 'Whether this session will be saved to cloud storage. Requires an active subscription with the stream_recording feature.',
      example: false,
    },
    platformHlsUrl: {
      type: 'string',
      nullable: true,
      description: 'HLS playlist URL served by the platform-native MediaMTX relay. Populated once the session is live. Use this to embed a player or share with viewers.',
      example: 'http://localhost:8888/live/abc123/index.m3u8',
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
  destinationAccountIds: z.array(z.string().uuid()).default([]),
});

// ---------------------------------------------------------------------------

export function registerLiveSessionRoutes(
  fastify: FastifyInstance,
  deps: LiveSessionRouteDeps,
): void {
  // GET /sessions/:sessionId/public — no auth, returns limited public info
  fastify.get<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/public',
    {
      schema: {
        tags: ['Live Sessions'],
        summary: 'Get public session info',
        description: 'Returns limited, public-facing session info for use on shared watch pages. No authentication required.',
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'Live session ID.' },
          },
        },
        response: {
          200: {
            description: 'Public session info.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  title: { type: 'string' },
                  status: { type: 'string', enum: ['created', 'starting', 'live', 'paused', 'ending', 'ended', 'error'] },
                  platforms: { type: 'array', items: { type: 'string', enum: ['tiktok', 'facebook'] } },
                  platformHlsUrl: { type: 'string', nullable: true },
                  startedAt: { type: 'string', format: 'date-time', nullable: true },
                  endedAt: { type: 'string', format: 'date-time', nullable: true },
                },
              },
            },
          },
          404: errorSchema('Session not found.'),
        },
      },
    },
    async (request, reply) => {
      const sessionId = request.params.sessionId as LiveSessionId;
      const session = await deps.sessionRepo.findById(sessionId);
      if (!session) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
      }
      const platforms = [...new Set(session.destinations.map((d) => d.platform))];
      return reply.send({
        data: {
          id: session.id,
          title: session.title,
          status: session.status,
          platforms,
          platformHlsUrl: session.platformHlsUrl,
          startedAt: session.startedAt?.toISOString() ?? null,
          endedAt: session.endedAt?.toISOString() ?? null,
        },
      });
    },
  );

  // All session routes require a valid JWT. Scoped inside `register` so the
  // hook does not apply to /health and /ready on the root instance.
  void fastify.register(async (child) => {
    child.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Bearer token' } });
      }
    });

  // POST /sessions -----------------------------------------------------------
  child.post(
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
- \`destinationAccountIds\` is optional — omit or pass an empty array to go live without broadcasting to any social platform.
- The session starts in the \`created\` state. Call \`POST /sessions/{sessionId}/start\` to begin broadcasting.

**Recording:**
- If the authenticated user has an active subscription with the \`stream_recording\` feature, \`shouldRecord\` is set to \`true\` and the stream-orchestrator will save the stream to cloud storage.
- Free-plan users stream without saving.

**Side effects:**
- A \`session.created\` NATS event is published, which the \`stream-orchestrator\` consumes to pre-allocate an RTMP ingest slot.
        `.trim(),
        security: bearerAuth,
        body: {
          type: 'object',
          required: ['title'],
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
              minItems: 0,
              description: 'UUIDs of connected social accounts to stream to. Omit or pass an empty array to go live without broadcasting to any social platform.',
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
      const userId = (request.user as { sub: string }).sub as UserId;
      const correlationId = (request.headers['x-correlation-id'] as string | undefined) ?? crypto.randomUUID();

      let shouldRecord = false;
      if (deps.billingServiceUrl) {
        try {
          const authHeader = request.headers['authorization'];
          const billingRes = await fetch(`${deps.billingServiceUrl}/billing/entitlements`, {
            headers: authHeader ? { Authorization: authHeader } : {},
          });
          if (billingRes.ok) {
            const { data } = (await billingRes.json()) as { data: { features: string[] } };
            shouldRecord = Array.isArray(data.features) && data.features.includes('stream_recording');
          }
        } catch {
          // Billing service unreachable — default to no recording
        }
      }

      try {
        const input = {
          userId,
          title: body.title,
          destinationAccountIds: body.destinationAccountIds as import('@tik-live-pro/shared-types').SocialAccountId[],
          shouldRecord,
          ...(body.description === undefined ? {} : { description: body.description }),
        };

        const result = await deps.createSession.execute(
          input,
          correlationId,
        );
        return reply.status(201).send({ data: { sessionId: result.sessionId } });
      } catch (err) {
        if (err instanceof ConflictError) {
          return reply.status(409).send({ error: { code: 'CONFLICT', message: err.message } });
        }
        throw err;
      }
    },
  );

  // GET /sessions (history) --------------------------------------------------
  child.get(
    '/sessions',
    {
      schema: {
        tags: ['Live Sessions'],
        summary: 'List sessions',
        description: 'Returns all live sessions for the authenticated user, sorted by creation time (newest first).',
        security: bearerAuth,
        response: {
          200: {
            description: 'Session list.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'array',
                items: sessionSchema,
              },
            },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
        },
      },
    },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub as UserId;
      const sessions = await deps.sessionRepo.findByUserId(userId);
      const sorted = sessions.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return reply.status(200).send({ data: sorted });
    },
  );

  // GET /sessions/:sessionId -------------------------------------------------
  child.get<{ Params: { sessionId: string } }>(
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
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub as UserId;
      const sessionId = request.params.sessionId as LiveSessionId;

      const session = await deps.sessionRepo.findById(sessionId);
      if (!session) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
      }
      if (session.userId !== userId) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      }

      return reply.send({
        data: {
          id: session.id,
          userId: session.userId,
          title: session.title,
          description: session.description,
          status: session.status,
          destinations: session.destinations,
          shouldRecord: session.shouldRecord,
          platformHlsUrl: session.platformHlsUrl,
          startedAt: session.startedAt?.toISOString() ?? null,
          endedAt: session.endedAt?.toISOString() ?? null,
          createdAt: session.createdAt.toISOString(),
        },
      });
    },
  );

  // POST /sessions/:sessionId/start -----------------------------------------
  child.post<{ Params: { sessionId: string } }>(
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
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub as UserId;
      const sessionId = request.params.sessionId as LiveSessionId;
      const correlationId = (request.headers['x-correlation-id'] as string | undefined) ?? crypto.randomUUID();

      try {
        await deps.startSession.execute(sessionId, userId, correlationId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: err.message } });
        }
        if (err instanceof ForbiddenError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        if (err instanceof ConflictError) {
          return reply.status(409).send({ error: { code: 'CONFLICT', message: err.message } });
        }
        throw err;
      }
    },
  );

  // POST /sessions/:sessionId/pause -----------------------------------------
  child.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/pause',
    {
      schema: {
        tags: ['Live Sessions'],
        summary: 'Pause a live session',
        description: `
Pauses a session that is currently \`live\`. The RTMP feed remains connected but broadcasting is suspended on all destinations.

**Side effects:**
- A \`session.paused\` NATS event is emitted so downstream consumers can mute the stream on each platform.

**Note:** Only sessions in \`live\` status can be paused.
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
          204: { description: 'Session paused. No response body.' },
          401: errorSchema('Missing or invalid Bearer token.'),
          403: errorSchema('Session belongs to a different user.'),
          404: errorSchema('Session not found.'),
          409: errorSchema('Session is not in `live` status.'),
        },
      },
    },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub as UserId;
      const sessionId = request.params.sessionId as LiveSessionId;
      const correlationId = (request.headers['x-correlation-id'] as string | undefined) ?? crypto.randomUUID();

      try {
        await deps.pauseSession.execute(sessionId, userId, correlationId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: err.message } });
        }
        if (err instanceof ForbiddenError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        if (err instanceof DomainError) {
          return reply.status(409).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );

  // POST /sessions/:sessionId/resume ----------------------------------------
  child.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/resume',
    {
      schema: {
        tags: ['Live Sessions'],
        summary: 'Resume a paused session',
        description: `
Resumes a session that is currently \`paused\`, transitioning it back to \`live\`.

**Side effects:**
- A \`session.resumed\` NATS event is emitted so downstream consumers can unmute the stream on each platform.

**Note:** Only sessions in \`paused\` status can be resumed.
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
          204: { description: 'Session resumed. No response body.' },
          401: errorSchema('Missing or invalid Bearer token.'),
          403: errorSchema('Session belongs to a different user.'),
          404: errorSchema('Session not found.'),
          409: errorSchema('Session is not in `paused` status.'),
        },
      },
    },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub as UserId;
      const sessionId = request.params.sessionId as LiveSessionId;
      const correlationId = (request.headers['x-correlation-id'] as string | undefined) ?? crypto.randomUUID();

      try {
        await deps.resumeSession.execute(sessionId, userId, correlationId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: err.message } });
        }
        if (err instanceof ForbiddenError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        if (err instanceof DomainError) {
          return reply.status(409).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );

  // POST /sessions/:sessionId/end -------------------------------------------
  child.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/end',
    {
      schema: {
        tags: ['Live Sessions'],
        summary: 'End a session',
        description: `
Gracefully terminates the live session: transitions to \`ending\`, stops all ffmpeg broadcast workers, and finalizes the stream on each platform.

**Side effects:**
- A \`session.ended\` NATS event is emitted.
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
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub as UserId;
      const sessionId = request.params.sessionId as LiveSessionId;
      const correlationId = (request.headers['x-correlation-id'] as string | undefined) ?? crypto.randomUUID();

      try {
        await deps.endSession.execute(sessionId, userId, correlationId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({ error: { code: 'NOT_FOUND', message: err.message } });
        }
        if (err instanceof ForbiddenError) {
          return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        if (err instanceof ConflictError) {
          return reply.status(409).send({ error: { code: 'CONFLICT', message: err.message } });
        }
        if (err instanceof DomainError) {
          return reply.status(409).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );
  });
}
