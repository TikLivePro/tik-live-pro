import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import type { IStreamSessionRepository } from '../../domain/repositories/stream-session.repository.js';
import type { IRecordingRepository } from '../../infrastructure/db/recording.repo.impl.js';
import type { HandleStreamArrivedUseCase } from '../../application/use-cases/handle-stream-arrived.use-case.js';
import type { LiveSessionId } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';
import { StreamSessionStatus, RecordingStatus } from '../../domain/entities/stream-session.entity.js';
import { isPlatformUrl, resolveWithYtDlp, YtDlpError } from '../../infrastructure/ytdlp/ytdlp-resolver.js';
import {
  registerVideoPush,
  stopVideoPush,
  unregisterVideoPush,
} from '../../infrastructure/ffmpeg/video-push-registry.js';
import { generateTurnCredential } from '../../infrastructure/turn/turn-credentials.js';
import ffmpeg from 'fluent-ffmpeg';

// Crude SSRF guard shared with the merge-stream endpoint.
const PRIVATE_IP_RE =
  /^(localhost|127\.|0\.0\.0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fc|fd)/i;

// The JWT `sub` of the authenticated caller. Every session-scoped route must
// compare this against session.userId — without it any authenticated user can
// read another host's ingest key (stream hijack) or control their session.
function jwtSub(req: { user?: unknown }): string | null {
  const user = req.user as { sub?: unknown } | undefined;
  return typeof user?.sub === 'string' ? user.sub : null;
}

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

interface IceServerEntry {
  urls: string[];
  username?: string;
  credential?: string;
}

const iceServersSchema = {
  type: 'array',
  description:
    'STUN is always included. A TURN entry with a short-lived (1h) HMAC credential is appended when TURN_SECRET/TURN_URLS are configured — required for browsers behind a NAT/firewall that a direct or STUN-reflexive path cannot traverse.',
  items: {
    type: 'object',
    required: ['urls'],
    properties: {
      urls: { type: 'array', items: { type: 'string' }, example: ['turn:webrtc.tiklivepro.me:3478?transport=udp'] },
      username: { type: 'string', description: 'Present only on the TURN entry.' },
      credential: { type: 'string', description: 'Present only on the TURN entry. Base64 HMAC-SHA1, valid for 1 hour.' },
    },
  },
};

// STUN always ships; TURN is appended only when the deployment has a coturn relay
// configured. `label` becomes part of the HMAC-signed username — pass a random UUID
// rather than anything session-identifying, since this response is not authenticated.
function buildIceServers(
  deps: { turnSecret: string | null; turnUrls: string[] },
  label: string,
): IceServerEntry[] {
  const servers: IceServerEntry[] = [{ urls: ['stun:stun.l.google.com:19302'] }];
  if (deps.turnSecret && deps.turnUrls.length > 0) {
    const { username, credential } = generateTurnCredential(deps.turnSecret, label);
    servers.push({ urls: deps.turnUrls, username, credential });
  }
  return servers;
}

// ---------------------------------------------------------------------------

// Per-IP rate limiter for the video-proxy/resolve endpoint.
// Keeps only the current window in memory — no external store needed.
const resolveRateLimiter = new Map<string, { count: number; windowStart: number }>();
const RESOLVE_MAX = 5;
const RESOLVE_WINDOW_MS = 60_000;

function checkResolveRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = resolveRateLimiter.get(ip);
  if (!entry || now - entry.windowStart > RESOLVE_WINDOW_MS) {
    resolveRateLimiter.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RESOLVE_MAX) return false;
  entry.count++;
  return true;
}

// Per-IP rate limiter for the merge-stream endpoint (concurrent open streams).
// One active merge stream per IP at a time is generous for normal use.
const mergeRateLimiter = new Map<string, number>(); // ip → active stream count
const MERGE_MAX_PER_IP = 3;

function acquireMergeSlot(ip: string): boolean {
  const current = mergeRateLimiter.get(ip) ?? 0;
  if (current >= MERGE_MAX_PER_IP) return false;
  mergeRateLimiter.set(ip, current + 1);
  return true;
}

function releaseMergeSlot(ip: string): void {
  const current = mergeRateLimiter.get(ip) ?? 1;
  const next = Math.max(0, current - 1);
  if (next === 0) mergeRateLimiter.delete(ip);
  else mergeRateLimiter.set(ip, next);
}

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
    turnSecret: string | null;
    turnUrls: string[];
    logger: Logger;
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
      await req.jwtVerify();
      const sub = jwtSub(req);
      const raw = req.query.sessionIds ?? '';
      const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
      // Only return recordings for sessions the caller owns.
      const owned: string[] = [];
      for (const id of ids) {
        const session = await deps.sessionRepo.findBySessionId(id as LiveSessionId).catch(() => null);
        if (session && session.userId === sub) owned.push(id);
      }
      const records = owned.length > 0 ? await deps.recordingRepo.findBySessionIds(owned) : [];
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
    async (req, reply) => {
      await req.jwtVerify();
      const sub = jwtSub(req);
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
          // Only expose recordings for sessions the caller owns.
          if (!session || session.userId !== sub) return null;
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
            required: ['ingestUrl', 'ingestKey', 'hlsUrl', 'whipUrl', 'status', 'iceServers'],
            properties: {
              iceServers: iceServersSchema,
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
      await req.jwtVerify();
      const session = await deps.sessionRepo.findBySessionId(
        req.params.sessionId as LiveSessionId,
      );

      if (!session || session.userId !== jwtSub(req)) {
        // 404 (not 403) for foreign sessions: don't leak their existence.
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
        iceServers: buildIceServers(deps, randomUUID()),
        status: session.status,
      });
    },
  );

  // GET /ice-servers ------------------------------------------------------------
  app.get(
    '/ice-servers',
    {
      schema: {
        tags: ['Streaming'],
        summary: 'Get WebRTC ICE servers',
        description: `
Returns the STUN/TURN server list a browser should pass to \`RTCPeerConnection\` when publishing (WHIP) or watching (WHEP) a stream.

Public — no authentication required. Unauthenticated viewers watching a public stream over WebRTC also need TURN credentials, since anyone behind a NAT/firewall that a direct or STUN-reflexive path can't traverse needs a relay to connect at all.

TURN credentials are short-lived (1 hour) and only checked once, at the moment the browser allocates a relay — an already-established connection keeps working past expiry. Fetch a fresh set for every new connection attempt rather than caching it.
        `.trim(),
        response: {
          200: {
            description: 'ICE server list.',
            type: 'object',
            required: ['iceServers'],
            properties: { iceServers: iceServersSchema },
          },
        },
      },
    },
    async (_req, reply) => {
      await reply.status(200).send({ iceServers: buildIceServers(deps, randomUUID()) });
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
MediaMTX writes segments as \`.mp4\` files (fragmented MP4 format); the RecordingUploader
in this service uploads them to object storage (DO Spaces or Cloudflare R2) after each
segment is finalised.

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
      await req.jwtVerify();
      const session = await deps.sessionRepo.findBySessionId(
        req.params.sessionId as LiveSessionId,
      );
      if (!session || session.userId !== jwtSub(req)) {
        // 404 (not 403) for foreign sessions: don't leak their existence.
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
        description: 'Stops the active recording for a session. Sets record:false on the MediaMTX path, which immediately finalises the current segment and queues it for upload.',
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
      await req.jwtVerify();
      const session = await deps.sessionRepo.findBySessionId(
        req.params.sessionId as LiveSessionId,
      );
      if (!session || session.userId !== jwtSub(req)) {
        // 404 (not 403) for foreign sessions: don't leak their existence.
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

      // Guard: can only stop recording if it was started by the user
      if (
        session.recordingStatus !== RecordingStatus.RECORDING &&
        session.recordingStatus !== RecordingStatus.PAUSED
      ) {
        await reply.status(409).send({ code: 'NOT_RECORDING', message: 'No active recording to stop' });
        return;
      }

      // PATCH record:false so MediaMTX immediately flushes and renames the current
      // .mp4.part segment to .mp4. Using DELETE here removes the config entry but
      // does NOT guarantee immediate finalization — the file can stay as .mp4.part
      // until the publisher disconnects, causing the uploader to miss it entirely.
      const res = await fetch(`${deps.mediaMtxApiUrl}/v3/config/paths/patch/${pathName}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ record: false }),
      });
      // 404 means no path config exists → recording wasn't active, treat as success
      if (!res.ok && res.status !== 404) {
        const body = await res.text().catch(() => '');
        await reply.status(502).send({ code: 'MEDIAMTX_ERROR', message: `Failed to stop recording (MediaMTX ${res.status}: ${body})` });
        return;
      }
      // Move to STOPPED — the uploader will pick up all .mp4 files for this session
      // on its next scan and upload them to object storage.
      session.finalizeRecording();
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
      await req.jwtVerify();
      const session = await deps.sessionRepo.findBySessionId(req.params.sessionId as LiveSessionId);
      if (!session || session.userId !== jwtSub(req)) {
        // 404 (not 403) for foreign sessions: don't leak their existence.
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
      await req.jwtVerify();
      const session = await deps.sessionRepo.findBySessionId(req.params.sessionId as LiveSessionId);
      if (!session || session.userId !== jwtSub(req)) {
        // 404 (not 403) for foreign sessions: don't leak their existence.
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
              status: { type: 'string', enum: ['none', 'recording', 'paused', 'stopped'], description: 'Current recording state. `stopped` means the user has stopped recording and files are being uploaded to storage.' },
            },
          },
          404: errorSchema('Session not found.'),
        },
      },
    },
    async (req, reply) => {
      await req.jwtVerify();
      const session = await deps.sessionRepo.findBySessionId(req.params.sessionId as LiveSessionId);
      if (!session || session.userId !== jwtSub(req)) {
        // 404 (not 403) for foreign sessions: don't leak their existence.
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
      await req.jwtVerify();
      const session = await deps.sessionRepo.findBySessionId(
        req.params.sessionId as LiveSessionId,
      );
      if (!session || session.userId !== jwtSub(req)) {
        // 404 (not 403) for foreign sessions: don't leak their existence.
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
      await req.jwtVerify();
      const recording = await deps.recordingRepo.findById(req.params.recordingId);
      if (!recording) {
        await reply.status(404).send({ code: 'NOT_FOUND', message: 'Recording not found' });
        return;
      }
      const owningSession = await deps.sessionRepo
        .findBySessionId(recording.sessionId as LiveSessionId)
        .catch(() => null);
      if (!owningSession || owningSession.userId !== jwtSub(req)) {
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

  // POST /sessions/:sessionId/video-push ----------------------------------------
  // Accepts an HTTP/HTTPS URL of a video file and uses ffmpeg to push it into
  // the RTMP ingest pipeline for this session.
  //
  // NOTE: The videoUri MUST be an HTTP or HTTPS URL accessible by the server.
  //       Mobile device local paths (file://, /storage/...) cannot be used here
  //       because the server has no access to the mobile device filesystem.
  //       Host your video on a reachable server (LAN, CDN, etc.) and pass the URL.
  app.post<{ Params: { sessionId: string }; Body: { videoUri?: string } }>(
    '/sessions/:sessionId/video-push',
    {
      schema: {
        tags: ['Streaming'],
        summary: 'Push a remote video URL into the RTMP stream',
        description:
          'Accepts an **HTTP or HTTPS URL** of a video file and starts an ffmpeg process that ' +
          'fetches and pushes it directly into the session RTMP ingest key. ' +
          'The file loops until the session ends or a new video-push replaces it. ' +
          'Only valid when session status is `live`.\n\n' +
          '> **Important:** The URL must be reachable by the orchestrator server. ' +
          'Mobile device local paths (`file://`, `/storage/...`) are **not** supported — ' +
          'host your video on a CDN, LAN HTTP server, or similar.',
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'UUID of the live session.' },
          },
        },
        body: {
          type: 'object',
          required: ['videoUri'],
          properties: {
            videoUri: {
              type: 'string',
              description:
                'HTTP or HTTPS URL of the video to stream. ' +
                'Must be accessible by the orchestrator server (not a device-local path).',
              example: 'https://cdn.example.com/streams/intro.mp4',
            },
          },
        },
        response: {
          200: {
            description: 'Video push started.',
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['started'], example: 'started' },
            },
          },
          400: errorSchema('videoUri is missing or not a valid HTTP/HTTPS URL.'),
          404: errorSchema('Session not found.'),
          409: errorSchema('Session is not live — cannot push video.'),
        },
      },
    },
    async (req, reply) => {
      await req.jwtVerify();
      const session = await deps.sessionRepo.findBySessionId(
        req.params.sessionId as LiveSessionId,
      );

      if (!session || session.userId !== jwtSub(req)) {
        // 404 (not 403) for foreign sessions: don't leak their existence.
        await reply.status(404).send({ code: 'NOT_FOUND', message: 'Session not found' });
        return;
      }

      if (session.status !== StreamSessionStatus.LIVE || !session.ingestKey) {
        await reply.status(409).send({ code: 'NOT_LIVE', message: 'Session is not live' });
        return;
      }

      const rawUri = req.body.videoUri;
      if (!rawUri) {
        await reply.status(400).send({ code: 'MISSING_URI', message: 'videoUri is required' });
        return;
      }

      // Only HTTP/HTTPS URLs are supported. Local device paths (file://, /storage/...)
      // are rejected because the server has no access to the mobile device filesystem.
      const isHttpUrl = rawUri.startsWith('http://') || rawUri.startsWith('https://');
      if (!isHttpUrl) {
        await reply.status(400).send({
          code: 'INVALID_URI',
          message:
            'videoUri must be an HTTP or HTTPS URL accessible by the server. ' +
            'Local device paths (file://, /storage/, etc.) are not supported — ' +
            'host the video on a reachable server and pass the HTTP URL.',
        });
        return;
      }

      // SSRF guard — same policy as merge-stream: no private/loopback hosts.
      try {
        const parsedUri = new URL(rawUri);
        if (PRIVATE_IP_RE.test(parsedUri.hostname)) {
          await reply.status(400).send({ code: 'PRIVATE_URL', message: 'Private or loopback URLs are not allowed.' });
          return;
        }
      } catch {
        await reply.status(400).send({ code: 'INVALID_URI', message: 'videoUri is not a valid URL.' });
        return;
      }

      // If this is a platform URL (YouTube, Twitch, Vimeo, Dailymotion), resolve it
      // to a direct media URL via yt-dlp before handing it to ffmpeg.
      let videoUri = rawUri;
      if (isPlatformUrl(rawUri)) {
        try {
          const resolved = await resolveWithYtDlp(rawUri, deps.logger);
          req.log.info({ originalUri: rawUri, resolvedUri: resolved.url }, 'video-push: resolved platform URL via yt-dlp');
          videoUri = resolved.url;
        } catch (err) {
          if (err instanceof YtDlpError) {
            if (err.code === 'NOT_INSTALLED') {
              await reply.status(503).send({ code: 'YTDLP_NOT_INSTALLED', message: 'yt-dlp is not installed on this server.' });
            } else if (err.code === 'NOT_FOUND') {
              await reply.status(422).send({ code: 'VIDEO_UNAVAILABLE', message: 'The video at that URL is unavailable or private.' });
            } else if (err.code === 'TIMEOUT') {
              await reply.status(504).send({ code: 'RESOLVE_TIMEOUT', message: 'Timed out resolving the platform URL.' });
            } else {
              await reply.status(422).send({ code: 'RESOLVE_FAILED', message: 'Could not extract a playable URL from that platform link.' });
            }
          } else {
            await reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Unexpected error resolving URL.' });
          }
          return;
        }
      }

      // Kill any existing video-push process for this session before starting a new one.
      if (stopVideoPush(session.sessionId)) {
        req.log.info({ sessionId: session.sessionId }, 'video-push: killed previous ffmpeg process');
      }

      // The RTMP ingest URL for this session — same as what GET /ingest returns
      const rtmpIngestUrl = `rtmp://${deps.rtmpIngestHost}:${deps.rtmpIngestPort}/live/${session.ingestKey}`;
      const sessionId = session.sessionId;

      // Run ffmpeg: pull the remote HTTP video URL and push into the RTMP ingest.
      // -stream_loop -1  → loop the file indefinitely until killed
      // -re              → read at native frame rate (real-time, not full-speed)
      // -c:v libx264     → re-encode to H.264 — FLV/RTMP ONLY supports H.264.
      //                    Using "-c:v copy" fails silently when the source is H.265,
      //                    VP9, AV1, etc., producing a black stream or ffmpeg error.
      // -preset veryfast → fast encode with acceptable quality for live streaming
      // -tune zerolatency→ minimise encoder buffering / latency
      // -c:a aac         → re-encode audio to AAC (RTMP standard)
      const proc = ffmpeg(videoUri)
        .inputOptions(['-stream_loop -1', '-re'])
        .outputOptions([
          '-map 0:v:0',
          '-map 0:a:0?',
          '-c:v libx264',
          '-preset veryfast',
          '-tune zerolatency',
          '-crf 23',
          '-c:a aac',
          '-b:a 128k',
          '-ar 44100',
          '-ac 2',
          '-f flv',
        ])
        .output(rtmpIngestUrl)
        .on('start', (cmd) => {
          req.log.info({ cmd, sessionId }, 'video-push ffmpeg started');
        })
        .on('error', (err: Error) => {
          req.log.error({ err, sessionId }, 'video-push ffmpeg error');
          unregisterVideoPush(sessionId, proc);
        })
        .on('end', () => {
          req.log.info({ sessionId }, 'video-push ffmpeg ended');
          unregisterVideoPush(sessionId, proc);
        });

      proc.run();
      registerVideoPush(sessionId, proc);

      await reply.status(200).send({ status: 'started' });
    },
  );

  // POST /video-proxy/resolve ---------------------------------------------------
  // Resolves a streaming-platform URL (YouTube, Twitch, Vimeo, Dailymotion) to
  // a direct media URL using yt-dlp.  The resolved URL can then be loaded by the
  // browser's <video> element or fed back into POST /sessions/:id/video-push.
  //
  // Always fetches the highest available combined (audio+video) format unless
  // `height` is supplied, in which case the best combined format at or below
  // that height is returned.  The response also includes `availableHeights` so
  // the caller can render a quality picker without a second round-trip.
  //
  // Rate-limited to 5 requests per IP per minute to prevent abuse.
  // yt-dlp must be installed and available in PATH on the server.
  app.post<{ Body: { url?: string; height?: number } }>(
    '/video-proxy/resolve',
    {
      schema: {
        tags: ['Video Proxy'],
        summary: 'Resolve a platform URL to a direct media URL',
        description: `
Invokes \`yt-dlp\` on the server to extract a direct, playable media URL from a
streaming-platform link (YouTube, Twitch, Vimeo, Dailymotion).

**Supported platforms:** YouTube, Twitch, Vimeo, Dailymotion.
Facebook, Instagram, and TikTok are intentionally excluded due to DRM and
authentication requirements that make extraction unreliable.

**Rate limit:** 5 requests per IP per 60 seconds.

**Requirement:** \`yt-dlp\` must be installed and available in \`PATH\` on the server.
Install with \`pip install yt-dlp\` or \`brew install yt-dlp\`.

The returned \`resolvedUrl\` is a time-limited CDN URL valid for several minutes.
For long-running sessions, call this endpoint again to refresh the URL.

Pass an optional \`height\` to cap the source resolution (e.g. \`720\` for 720p).
Omit it to receive the highest available combined format.  The response always
includes \`availableHeights\` — all heights available as combined (audio+video)
formats — so the client can show a quality picker without an extra round-trip.
        `.trim(),
        security: bearerAuth,
        body: {
          type: 'object',
          required: ['url'],
          additionalProperties: false,
          properties: {
            url: {
              type: 'string',
              description: 'The platform URL to resolve (YouTube, Twitch, Vimeo, or Dailymotion).',
              example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            },
            height: {
              type: 'integer',
              minimum: 1,
              description: 'Optional maximum height cap in pixels (e.g. 720). Omit for highest available.',
              example: 720,
            },
          },
        },
        response: {
          200: {
            description: 'Resolved successfully.',
            type: 'object',
            required: ['resolvedUrl', 'title', 'availableHeights'],
            properties: {
              resolvedUrl: {
                type: 'string',
                description: 'Direct video CDN URL. For DASH this is the video-only stream; pair with audioUrl.',
              },
              audioUrl: {
                type: 'string',
                description: 'Audio-only CDN URL. Present only for DASH streams; absent when the video already contains audio.',
              },
              title: {
                type: 'string',
                description: 'Title of the video as reported by yt-dlp.',
              },
              availableHeights: {
                type: 'array',
                items: { type: 'integer' },
                description: 'All heights (px) available as video streams, sorted descending.',
                example: [1080, 720, 480, 360],
              },
            },
          },
          400: errorSchema('url is missing or not from a supported platform.'),
          401: errorSchema('Missing or invalid Bearer token.'),
          422: errorSchema('Video is unavailable or private.'),
          429: errorSchema('Rate limit exceeded — 5 resolves per IP per 60 s.'),
          503: errorSchema('yt-dlp is not installed on this server.'),
          504: errorSchema('yt-dlp timed out resolving the URL.'),
        },
      },
    },
    async (req, reply) => {
      await req.jwtVerify();
      const rawUrl = req.body.url;
      if (!rawUrl || !isPlatformUrl(rawUrl)) {
        await reply.status(400).send({
          code: 'UNSUPPORTED_PLATFORM',
          message: 'url must be a YouTube, Twitch, Vimeo, or Dailymotion link.',
        });
        return;
      }

      const ip = req.ip;
      if (!checkResolveRateLimit(ip)) {
        await reply.status(429).send({
          code: 'RATE_LIMITED',
          message: 'Too many resolve requests. Try again in a minute.',
        });
        return;
      }

      const maxHeight = typeof req.body.height === 'number' && req.body.height > 0
        ? req.body.height
        : undefined;

      try {
        const result = await resolveWithYtDlp(rawUrl, deps.logger, maxHeight);
        const body: Record<string, unknown> = {
          resolvedUrl: result.url,
          title: result.title,
          availableHeights: result.availableHeights,
        };
        if (result.audioUrl) body['audioUrl'] = result.audioUrl;
        await reply.status(200).send(body);
      } catch (err) {
        if (err instanceof YtDlpError) {
          if (err.code === 'NOT_INSTALLED') {
            await reply.status(503).send({ code: 'YTDLP_NOT_INSTALLED', message: 'yt-dlp is not installed on this server.' });
          } else if (err.code === 'NOT_FOUND') {
            await reply.status(422).send({ code: 'VIDEO_UNAVAILABLE', message: 'The video at that URL is unavailable or private.' });
          } else if (err.code === 'TIMEOUT') {
            await reply.status(504).send({ code: 'RESOLVE_TIMEOUT', message: 'Timed out resolving the URL.' });
          } else {
            await reply.status(422).send({ code: 'RESOLVE_FAILED', message: 'Could not extract a playable URL from that link.' });
          }
        } else {
          deps.logger.error({ err, url: rawUrl }, 'Unexpected error in video-proxy/resolve');
          await reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error.' });
        }
      }
    },
  );

  // GET /video-proxy/merge-stream -------------------------------------------------
  // Accepts two CDN URLs (video-only + audio-only from a DASH resolve) and streams
  // a real-time ffmpeg merge as fragmented MP4.  The browser loads this via the
  // same-origin Next.js /api/video-stream proxy so captureStream() works.
  //
  // No Bearer auth: the CDN URLs are already time-limited tokens issued by the
  // resolve endpoint (which is auth-gated).  SSRF protection + per-IP concurrency
  // limits mitigate abuse.
  app.get<{ Querystring: { v?: string; a?: string } }>(
    '/video-proxy/merge-stream',
    {
      schema: {
        tags: ['Video Proxy'],
        summary: 'Stream a real-time merge of separate video + audio CDN URLs',
        description: `
Merges a DASH video-only CDN URL and an audio-only CDN URL using ffmpeg and
streams the result as fragmented MP4.  This is consumed by the browser
\`<video>\` element through the Next.js same-origin proxy so that
\`captureStream()\` can capture full-quality video for WHIP.

Both \`v\` and \`a\` must be HTTPS URLs from public CDN hosts (not private IPs).
The stream runs for as long as the client connection is open; closing the
connection kills the ffmpeg process.

**Rate limit:** ${MERGE_MAX_PER_IP} concurrent streams per IP.
        `.trim(),
        querystring: {
          type: 'object',
          required: ['v', 'a'],
          additionalProperties: false,
          properties: {
            v: { type: 'string', description: 'URL-encoded video-only CDN URL.' },
            a: { type: 'string', description: 'URL-encoded audio-only CDN URL.' },
          },
        },
      },
    },
    async (req, reply) => {
      const { v: rawV, a: rawA } = req.query;
      req.log.info({ hasV: !!rawV, hasA: !!rawA }, 'merge-stream request received');
      if (!rawV || !rawA) {
        await reply.status(400).send({ code: 'MISSING_PARAMS', message: 'v and a query params are required.' });
        return;
      }

      // SSRF guard
      let vUrl: URL;
      let aUrl: URL;
      try {
        vUrl = new URL(rawV);
        aUrl = new URL(rawA);
      } catch {
        await reply.status(400).send({ code: 'INVALID_URL', message: 'v or a is not a valid URL.' });
        return;
      }
      for (const u of [vUrl, aUrl]) {
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          await reply.status(400).send({ code: 'INVALID_URL', message: 'Only http/https URLs are allowed.' });
          return;
        }
        if (PRIVATE_IP_RE.test(u.hostname)) {
          await reply.status(400).send({ code: 'PRIVATE_URL', message: 'Private or loopback URLs are not allowed.' });
          return;
        }
      }

      const ip = req.ip;
      if (!acquireMergeSlot(ip)) {
        await reply.status(429).send({ code: 'RATE_LIMITED', message: `Max ${MERGE_MAX_PER_IP} concurrent merge streams per IP.` });
        return;
      }

      // Merge with ffmpeg: copy H.264+AAC without re-encoding, output fragmented
      // MP4 so the browser can start playback before the stream ends.
      const proc = spawn('ffmpeg', [
        '-i', rawV,
        '-i', rawA,
        '-c', 'copy',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        'pipe:1',
      ], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });

      proc.stderr?.on('data', (chunk: Buffer) => {
        req.log.debug({ msg: chunk.toString().trim() }, 'merge-stream ffmpeg');
      });

      proc.on('error', (err: Error) => {
        req.log.error({ err }, 'merge-stream ffmpeg spawn error');
        releaseMergeSlot(ip);
      });

      proc.on('close', () => {
        releaseMergeSlot(ip);
      });

      // Kill ffmpeg immediately when the client disconnects.
      req.raw.on('close', () => {
        proc.kill('SIGKILL');
      });

      await reply
        .header('Content-Type', 'video/mp4')
        .header('Cache-Control', 'no-store')
        .header('X-Accel-Buffering', 'no')
        .send(proc.stdout);
    },
  );
}
