import type { FastifyInstance } from 'fastify';
import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';
import type { IRecordingRepository } from '../../infrastructure/db/recording.repo.impl.js';
import type { HandleStreamArrivedUseCase } from '../../application/use-cases/handle-stream-arrived.use-case.js';
import type { LiveSessionId } from '@tik-live-pro/shared-types';
import { StreamSessionStatus, RecordingStatus } from '../../domain/entities/stream-session.entity.js';

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
    recordingRepo: IRecordingRepository;
    streamArrivalHandler: HandleStreamArrivedUseCase;
    rtmpIngestHost: string;
    rtmpIngestPort: number;
    mediaMtxHlsUrl: string;
    mediaMtxWebrtcUrl: string;
    mediaMtxApiUrl: string;
    mediaMtxApiAuthHeader: string | undefined;
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

  // GET /recordings/completed ------------------------------------------------
  app.get<{ Querystring: { sessionIds?: string } }>(
    '/recordings/completed',
    {
      schema: {
        tags: ['Streaming'],
        summary: 'List completed recordings by session IDs',
        description: 'Returns all uploaded recording files for the given session IDs, sorted newest-first.',
        security: bearerAuth,
        querystring: {
          type: 'object',
          properties: {
            sessionIds: {
              type: 'string',
              description: 'Comma-separated list of session UUIDs.',
              example: 'id1,id2,id3',
            },
          },
        },
        response: {
          200: {
            description: 'Completed recordings list.',
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    sessionId: { type: 'string' },
                    fileName: { type: 'string' },
                    publicUrl: { type: 'string' },
                    sizeBytes: { type: 'number' },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const raw = req.query.sessionIds ?? '';
      const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
      const records = await deps.recordingRepo.findBySessionIds(ids);
      await reply.status(200).send({
        items: records.map((r) => ({
          id: r.id,
          sessionId: r.sessionId,
          fileName: r.fileName,
          publicUrl: r.publicUrl,
          sizeBytes: r.sizeBytes,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    },
  );

  // GET /recordings -----------------------------------------------------------
  app.get(
    '/recordings',
    {
      schema: {
        tags: ['Streaming'],
        summary: 'List active recordings',
        description: `
Returns all paths currently being recorded in MediaMTX, enriched with session metadata (title, sessionId) looked up from the local database.

A recording is active when \`record: true\` has been set on the MediaMTX path config. Each item contains one or more segments; a segment without an end time is still accumulating data.
        `.trim(),
        security: bearerAuth,
        response: {
          200: {
            description: 'Active and paused recordings list.',
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    ingestKey: { type: 'string', description: 'MediaMTX path key.' },
                    sessionId: { type: 'string', nullable: true, description: 'Live session ID, if known.' },
                    title: { type: 'string', nullable: true, description: 'Session title.' },
                    status: { type: 'string', enum: ['recording', 'paused'], description: 'Whether recording is active or paused.' },
                    segments: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          startedAt: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          502: errorSchema('MediaMTX recordings API call failed.'),
        },
      },
    },
    async (_req, reply) => {
      const authHeaders = deps.mediaMtxApiAuthHeader ? { Authorization: deps.mediaMtxApiAuthHeader } : {};

      // Fetch recordings list and config paths in parallel.
      // The recordings list is filesystem-based (returns all paths that have segment
      // files on disk), so we cross-reference with the config list to keep only paths
      // that currently have record:true — i.e. recordings that are actively in progress.
      const [recordingsRes, configRes] = await Promise.all([
        fetch(`${deps.mediaMtxApiUrl}/v3/recordings/list`, { headers: authHeaders }),
        fetch(`${deps.mediaMtxApiUrl}/v3/config/paths/list`, { headers: authHeaders }),
      ]);

      if (!recordingsRes.ok) {
        const body = await recordingsRes.text().catch(() => '');
        await reply.status(502).send({ code: 'MEDIAMTX_ERROR', message: `MediaMTX recordings list failed (${recordingsRes.status}: ${body})` });
        return;
      }

      // Build set of path names where recording is currently active
      const activeRecordingPaths = new Set<string>();
      if (configRes.ok) {
        const configData = (await configRes.json()) as {
          items: Array<{ name: string; record: boolean }>;
        };
        for (const p of configData.items ?? []) {
          if (p.record) activeRecordingPaths.add(p.name);
        }
      }

      const data = (await recordingsRes.json()) as {
        items: Array<{ name: string; segments: Array<{ start: string }> }>;
      };

      const rawItems = await Promise.all(
        (data.items ?? []).map(async (item) => {
          const ingestKey = item.name.startsWith('live/') ? item.name.slice(5) : item.name;
          const session = await deps.sessionRepo.findByIngestKey(ingestKey).catch(() => null);
          const isActive = activeRecordingPaths.has(item.name);
          const isPaused = session?.recordingStatus === RecordingStatus.PAUSED;
          if (!isActive && !isPaused) return null;
          return {
            ingestKey,
            sessionId: session?.sessionId ?? null,
            title: session?.title ?? null,
            status: isActive ? 'recording' : 'paused',
            segments: item.segments.map((s) => ({ startedAt: s.start })),
          };
        }),
      );
      const items = rawItems.filter(Boolean);
      await reply.status(200).send({ items });
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

  // POST /sessions/:sessionId/recording/start -----------------------------------
  app.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/recording/start',
    {
      schema: {
        tags: ['Streaming'],
        summary: 'Start recording',
        description: `
Starts recording the live stream for a session to the shared recordings volume.
MediaMTX writes segments as \`.fmp4\` files; the RecordingUploader in this service
uploads them to object storage (DO Spaces or Cloudflare R2) after each segment completes.

Only valid when the session status is \`live\`.
        `.trim(),
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'UUID of the live session.' },
          },
        },
        response: {
          200: {
            description: 'Recording started.',
            type: 'object',
            properties: { recording: { type: 'boolean', example: true } },
          },
          404: errorSchema('Session not found.'),
          409: errorSchema('Session is not live — cannot start recording.'),
          502: errorSchema('MediaMTX recording API call failed.'),
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
      if (session.status !== StreamSessionStatus.LIVE || !session.ingestKey) {
        await reply.status(409).send({ code: 'NOT_LIVE', message: 'Session is not live' });
        return;
      }
      const pathName = encodeURIComponent(`live/${session.ingestKey}`);
      const authHeaders: Record<string, string> = deps.mediaMtxApiAuthHeader
        ? { Authorization: deps.mediaMtxApiAuthHeader }
        : {};

      // Try PATCH (path config may already exist); fall back to ADD on 404
      let res = await fetch(`${deps.mediaMtxApiUrl}/v3/config/paths/patch/${pathName}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ record: true }),
      });
      if (res.status === 404) {
        res = await fetch(`${deps.mediaMtxApiUrl}/v3/config/paths/add/${pathName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ record: true }),
        });
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        await reply.status(502).send({ code: 'MEDIAMTX_ERROR', message: `Failed to start recording (MediaMTX ${res.status}: ${body})` });
        return;
      }
      session.startRecording();
      await deps.sessionRepo.update(session);
      await reply.status(200).send({ recording: true });
    },
  );

  // POST /sessions/:sessionId/recording/stop ------------------------------------
  app.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/recording/stop',
    {
      schema: {
        tags: ['Streaming'],
        summary: 'Stop recording',
        description: 'Stops the active recording for a session. The current segment is finalised and queued for upload.',
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'UUID of the live session.' },
          },
        },
        response: {
          200: {
            description: 'Recording stopped.',
            type: 'object',
            properties: { recording: { type: 'boolean', example: false } },
          },
          404: errorSchema('Session not found.'),
          502: errorSchema('MediaMTX recording API call failed.'),
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
      if (!session.ingestKey) {
        await reply.status(409).send({ code: 'NO_INGEST_KEY', message: 'No ingest key for session' });
        return;
      }
      const pathName = encodeURIComponent(`live/${session.ingestKey}`);
      const authHeaders: Record<string, string> = deps.mediaMtxApiAuthHeader
        ? { Authorization: deps.mediaMtxApiAuthHeader }
        : {};

      // DELETE the explicit path config entry so the path falls back to all_others
      // (record: false). A plain PATCH { record: false } leaves a stale config entry
      // that MediaMTX keeps in its recordings list as long as segment files exist on disk.
      const res = await fetch(`${deps.mediaMtxApiUrl}/v3/config/paths/delete/${pathName}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      // 404 means path config was never created → recording wasn't active, treat as success
      if (!res.ok && res.status !== 404) {
        const body = await res.text().catch(() => '');
        await reply.status(502).send({ code: 'MEDIAMTX_ERROR', message: `Failed to stop recording (MediaMTX ${res.status}: ${body})` });
        return;
      }
      session.stopRecording();
      await deps.sessionRepo.update(session);
      await reply.status(200).send({ recording: false });
    },
  );

  // POST /sessions/:sessionId/recording/pause ------------------------------------
  app.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/recording/pause',
    {
      schema: {
        tags: ['Streaming'],
        summary: 'Pause recording',
        description: 'Pauses the active recording without stopping the stream. The current segment is finalised; a new segment will start on resume.',
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'UUID of the live session.' },
          },
        },
        response: {
          200: {
            description: 'Recording paused.',
            type: 'object',
            properties: { recording: { type: 'boolean', example: false } },
          },
          404: errorSchema('Session not found.'),
          409: errorSchema('No active recording to pause.'),
          502: errorSchema('MediaMTX recording API call failed.'),
        },
      },
    },
    async (req, reply) => {
      const session = await deps.sessionRepo.findBySessionId(req.params.sessionId as LiveSessionId);
      if (!session) {
        await reply.status(404).send({ code: 'NOT_FOUND', message: 'Session not found' });
        return;
      }
      if (session.recordingStatus !== RecordingStatus.RECORDING || !session.ingestKey) {
        await reply.status(409).send({ code: 'NOT_RECORDING', message: 'No active recording to pause' });
        return;
      }
      const pathName = encodeURIComponent(`live/${session.ingestKey}`);
      const authHeaders: Record<string, string> = deps.mediaMtxApiAuthHeader
        ? { Authorization: deps.mediaMtxApiAuthHeader }
        : {};
      const res = await fetch(`${deps.mediaMtxApiUrl}/v3/config/paths/patch/${pathName}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ record: false }),
      });
      if (!res.ok && res.status !== 404) {
        const body = await res.text().catch(() => '');
        await reply.status(502).send({ code: 'MEDIAMTX_ERROR', message: `Failed to pause recording (MediaMTX ${res.status}: ${body})` });
        return;
      }
      session.pauseRecording();
      await deps.sessionRepo.update(session);
      await reply.status(200).send({ recording: false });
    },
  );

  // POST /sessions/:sessionId/recording/resume ------------------------------------
  app.post<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/recording/resume',
    {
      schema: {
        tags: ['Streaming'],
        summary: 'Resume recording',
        description: 'Resumes a previously paused recording. A new segment is started.',
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'UUID of the live session.' },
          },
        },
        response: {
          200: {
            description: 'Recording resumed.',
            type: 'object',
            properties: { recording: { type: 'boolean', example: true } },
          },
          404: errorSchema('Session not found.'),
          409: errorSchema('Recording is not paused.'),
          502: errorSchema('MediaMTX recording API call failed.'),
        },
      },
    },
    async (req, reply) => {
      const session = await deps.sessionRepo.findBySessionId(req.params.sessionId as LiveSessionId);
      if (!session) {
        await reply.status(404).send({ code: 'NOT_FOUND', message: 'Session not found' });
        return;
      }
      if (session.recordingStatus !== RecordingStatus.PAUSED || !session.ingestKey) {
        await reply.status(409).send({ code: 'NOT_PAUSED', message: 'Recording is not paused' });
        return;
      }
      const pathName = encodeURIComponent(`live/${session.ingestKey}`);
      const authHeaders: Record<string, string> = deps.mediaMtxApiAuthHeader
        ? { Authorization: deps.mediaMtxApiAuthHeader }
        : {};
      let res = await fetch(`${deps.mediaMtxApiUrl}/v3/config/paths/patch/${pathName}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ record: true }),
      });
      if (res.status === 404) {
        res = await fetch(`${deps.mediaMtxApiUrl}/v3/config/paths/add/${pathName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ record: true }),
        });
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        await reply.status(502).send({ code: 'MEDIAMTX_ERROR', message: `Failed to resume recording (MediaMTX ${res.status}: ${body})` });
        return;
      }
      session.startRecording();
      await deps.sessionRepo.update(session);
      await reply.status(200).send({ recording: true });
    },
  );

  // GET /sessions/:sessionId/recording/status ------------------------------------
  app.get<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/recording/status',
    {
      schema: {
        tags: ['Streaming'],
        summary: 'Get recording status',
        description: 'Returns the current recording status for a session.',
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'UUID of the live session.' },
          },
        },
        response: {
          200: {
            description: 'Recording status.',
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['none', 'recording', 'paused'], description: 'Current recording state.' },
            },
          },
          404: errorSchema('Session not found.'),
        },
      },
    },
    async (req, reply) => {
      const session = await deps.sessionRepo.findBySessionId(req.params.sessionId as LiveSessionId);
      if (!session) {
        await reply.status(404).send({ code: 'NOT_FOUND', message: 'Session not found' });
        return;
      }
      await reply.status(200).send({ status: session.recordingStatus });
    },
  );

  // GET /sessions/:sessionId/recordings ------------------------------------------
  app.get<{ Params: { sessionId: string } }>(
    '/sessions/:sessionId/recordings',
    {
      schema: {
        tags: ['Streaming'],
        summary: 'List completed recordings for a session',
        description: 'Returns all recording files that have been uploaded to object storage for the given session.',
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'UUID of the live session.' },
          },
        },
        response: {
          200: {
            description: 'Recording files list.',
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    fileName: { type: 'string' },
                    publicUrl: { type: 'string' },
                    sizeBytes: { type: 'number' },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          404: errorSchema('Session not found.'),
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
      const items = await deps.recordingRepo.findBySessionId(
        req.params.sessionId as LiveSessionId,
      );
      await reply.status(200).send({
        items: items.map((r) => ({
          id: r.id,
          fileName: r.fileName,
          publicUrl: r.publicUrl,
          sizeBytes: r.sizeBytes,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    },
  );

  // GET /recordings/:recordingId/download ----------------------------------------
  app.get<{ Params: { recordingId: string } }>(
    '/recordings/:recordingId/download',
    {
      schema: {
        tags: ['Streaming'],
        summary: 'Download a recording file',
        description: 'Proxies the recording from object storage with Content-Disposition: attachment so the browser downloads it.',
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['recordingId'],
          properties: {
            recordingId: { type: 'string', description: 'Recording ID.' },
          },
        },
        response: {
          302: { description: 'Redirect to file URL.' },
          404: errorSchema('Recording not found.'),
        },
      },
    },
    async (req, reply) => {
      const recording = await deps.recordingRepo.findById(req.params.recordingId);
      if (!recording) {
        await reply.status(404).send({ code: 'NOT_FOUND', message: 'Recording not found' });
        return;
      }
      // Redirect with content-disposition injected via a query param isn't
      // universally supported, so we proxy the file to force the browser to download.
      const upstream = await fetch(recording.publicUrl);
      if (!upstream.ok || !upstream.body) {
        await reply.status(502).send({ code: 'FETCH_FAILED', message: 'Failed to fetch recording from storage' });
        return;
      }
      await reply
        .header('Content-Disposition', `attachment; filename="${recording.fileName}"`)
        .header('Content-Type', 'video/mp4')
        .send(upstream.body);
    },
  );
}
