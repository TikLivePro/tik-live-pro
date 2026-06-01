import type { FastifyInstance } from 'fastify';
import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';
import type { HandleStreamArrivedUseCase } from '../../application/use-cases/handle-stream-arrived.use-case.js';
import type { LiveSessionId } from '@tik-live-pro/shared-types';
import { StreamSessionStatus } from '../../domain/entities/stream-session.entity.js';

// ---------------------------------------------------------------------------
// Reusable schema fragments
// ---------------------------------------------------------------------------

const errorSchema = (description: string) => ({
  description,
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: { type: 'string', description: 'Machine-readable error code.', example: 'NOT_FOUND' },
    message: { type: 'string', description: 'Human-readable error message.', example: 'Session not found' },
  },
});

const bearerAuth = [{ BearerAuth: [] }];

// ---------------------------------------------------------------------------

export function registerRoutes(
  app: FastifyInstance,
  deps: {
    sessionRepo: IStreamSessionRepository;
    streamArrivalHandler: HandleStreamArrivedUseCase;
    rtmpIngestHost: string;
    rtmpIngestPort: number;
    mediaMtxHlsUrl: string;
    mediaMtxWebrtcUrl: string;
  },
): void {
  // GET /health ---------------------------------------------------------------
  app.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'Returns `ok` immediately. Used by Kubernetes liveness checks.',
        response: {
          200: {
            description: 'Service is alive.',
            type: 'object',
            properties: { status: { type: 'string', enum: ['ok'], example: 'ok' } },
          },
        },
      },
    },
    async (_req, reply) => reply.status(200).send({ status: 'ok' }),
  );

  // GET /ready ----------------------------------------------------------------
  app.get(
    '/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description: 'Returns `ready` when the service is fully initialized. Used by Kubernetes readiness checks.',
        response: {
          200: {
            description: 'Service is ready.',
            type: 'object',
            properties: { status: { type: 'string', enum: ['ready'], example: 'ready' } },
          },
        },
      },
    },
    async (_req, reply) => reply.status(200).send({ status: 'ready' }),
  );

  // GET /metrics --------------------------------------------------------------
  app.get(
    '/metrics',
    {
      schema: {
        tags: ['Observability'],
        summary: 'Prometheus metrics',
        description: `
Exposes internal runtime metrics in Prometheus text format.

**Current metrics:**
| Metric | Type | Description |
|---|---|---|
| \`stream_orchestrator_active_workers\` | gauge | Number of active ffmpeg transcoding workers |

Scraped by the Prometheus sidecar every 15 s.
        `.trim(),
        produces: ['text/plain'],
        response: {
          200: {
            description: 'Prometheus-formatted metrics.',
            type: 'string',
            example:
              '# HELP stream_orchestrator_active_workers Active ffmpeg workers\n# TYPE stream_orchestrator_active_workers gauge\nstream_orchestrator_active_workers 3\n',
          },
        },
      },
    },
    async (_req, reply) => {
      const activeWorkers = deps.streamArrivalHandler.activeWorkerCount();
      await reply.status(200).send(
        `# HELP stream_orchestrator_active_workers Active ffmpeg workers\n` +
        `# TYPE stream_orchestrator_active_workers gauge\n` +
        `stream_orchestrator_active_workers ${activeWorkers}\n`,
      );
    },
  );

  // GET /sessions/:sessionId/ingest -------------------------------------------
  app.get<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/ingest',
    {
      schema: {
        tags: ['Streaming'],
        summary: 'Get RTMP ingest endpoint',
        description: `
Returns the RTMP ingest URL and stream key for a session that is ready to receive a video stream.

**When to call this endpoint:**
1. The session has been created via the \`live-session\` service.
2. The \`stream-orchestrator\` has received the \`session.starting\` NATS event and allocated an ingest slot.
3. The status returned here transitions from \`idle\` → \`starting\` → \`broadcasting\`.

**Using the ingest URL:**
Point your broadcasting software (OBS, FFmpeg, etc.) at the returned \`ingestUrl\`:
\`\`\`
rtmp://<host>:<port>/live/<ingestKey>
\`\`\`

> **Authorization required.** Send \`Authorization: Bearer <accessToken>\`.
        `.trim(),
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: {
              type: 'string',
              format: 'uuid',
              description: 'UUID of the live session.',
              example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            },
          },
        },
        response: {
          200: {
            description: 'Ingest endpoint is ready.',
            type: 'object',
            required: ['ingestUrl', 'ingestKey', 'hlsUrl', 'whipUrl', 'status'],
            properties: {
              ingestUrl: {
                type: 'string',
                description:
                  'Full RTMP URL to push the video stream to (for OBS / external tools). Example: `rtmp://rtmp.tiklivepro.pro:1935/live/abc123`.',
                example: 'rtmp://localhost:1935/live/abc123def456',
              },
              ingestKey: {
                type: 'string',
                description:
                  'Unique stream key for this session. Included in the ingestUrl but provided separately for OBS-style configuration.',
                example: 'abc123def456',
              },
              hlsUrl: {
                type: 'string',
                description: 'HLS playlist URL for platform-native playback (MediaMTX). Share with viewers or embed in a player.',
                example: 'http://localhost:8888/live/abc123def456/index.m3u8',
              },
              whipUrl: {
                type: 'string',
                description: 'WebRTC-HTTP Ingestion Protocol (WHIP) endpoint for browser-based streaming. POST an SDP offer here to start streaming from the browser.',
                example: 'http://localhost:8889/live/abc123def456/whip',
              },
              status: {
                type: 'string',
                enum: ['waiting_for_stream', 'live', 'ending', 'ended', 'error'],
                description: 'Current stream session status.',
                example: 'waiting_for_stream',
              },
            },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
          404: errorSchema('No stream session found for the given sessionId.'),
          409: errorSchema(
            'Session exists but the ingest endpoint is not ready yet (status is `idle` or `starting`). Retry after a short delay.',
          ),
        },
      },
    },
    async (req, reply) => {
      const session = await deps.sessionRepo.findBySessionId(
        req.params.sessionId as LiveSessionId,
      );

      if (!session) {
        await reply.status(404).send({ code: 'NOT_FOUND', message: 'Session not found' });
        return;
      }

      if (
        session.status === StreamSessionStatus.IDLE ||
        session.status === StreamSessionStatus.STARTING ||
        !session.ingestKey
      ) {
        await reply.status(409).send({ code: 'NOT_READY', message: 'Ingest endpoint not ready yet' });
        return;
      }

      await reply.status(200).send({
        ingestUrl: `rtmp://${deps.rtmpIngestHost}:${deps.rtmpIngestPort}/live/${session.ingestKey}`,
        ingestKey: session.ingestKey,
        hlsUrl: `${deps.mediaMtxHlsUrl}/live/${session.ingestKey}/index.m3u8`,
        whipUrl: `${deps.mediaMtxWebrtcUrl}/live/${session.ingestKey}/whip`,
        status: session.status,
      });
    },
  );
}
