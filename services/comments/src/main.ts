import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { Server as SocketIOServer } from 'socket.io';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseEnv, baseEnvSchema } from '@tik-live-pro/config';
import { createLogger } from '@tik-live-pro/logger';
import { NatsJetStreamClient, ensureStreams, Subjects } from '@tik-live-pro/events';
import type { SessionCreatedPayload, CommentReceivedPayload } from '@tik-live-pro/events';
import { StringCodec, consumerOpts, createInbox } from 'nats';
import { AdapterRegistry, TikTokAdapter, FacebookAdapter } from '@tik-live-pro/platform-adapters';
import { registerCommentsRoutes, broadcastComment, setIo } from './interfaces/http/comments.routes.js';
import { sql } from 'drizzle-orm';
import { comments, reactions, viewerPeaks } from './infrastructure/db/schema.js';
import { CommentPoller } from './application/comment-poller.js';
import { CommentPoster } from './application/comment-poster.js';
import { SessionRegistry } from './application/session-registry.js';
import type { BaseEvent, SocialPlatform, LiveSessionId, SocialAccountId } from '@tik-live-pro/shared-types';

const envSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(64),
  COMMENT_POLL_INTERVAL_MS: z.coerce.number().default(2000),
  INTEGRATIONS_SERVICE_URL: z.string().url().default('http://localhost:3005'),
  INTERNAL_API_KEY: z.string().min(32),
  TIKTOK_CLIENT_KEY: z.string().default(''),
  TIKTOK_CLIENT_SECRET: z.string().default(''),
  FACEBOOK_APP_ID: z.string().default(''),
  FACEBOOK_APP_SECRET: z.string().default(''),
});

const env = parseEnv(envSchema);
const logger = createLogger('comments-service', { level: env.LOG_LEVEL });

async function bootstrap(): Promise<void> {
  const sc = StringCodec();
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    min: 2,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
  });
  const db = drizzle(pool);

  const nats = new NatsJetStreamClient();
  await nats.connect({ servers: [env.NATS_URL], name: 'comments-service' });
  logger.info({ natsUrl: env.NATS_URL }, 'Connected to NATS');
  await ensureStreams(nats.getJetStreamManager());

  // ---------------------------------------------------------------------------
  // Platform adapters
  // ---------------------------------------------------------------------------
  const adapterRegistry = new AdapterRegistry();
  adapterRegistry.register(new TikTokAdapter({ clientKey: env.TIKTOK_CLIENT_KEY, clientSecret: env.TIKTOK_CLIENT_SECRET }, logger));
  adapterRegistry.register(new FacebookAdapter({ appId: env.FACEBOOK_APP_ID, appSecret: env.FACEBOOK_APP_SECRET }, logger));

  // ---------------------------------------------------------------------------
  // Application services
  // ---------------------------------------------------------------------------
  const sessionRegistry = new SessionRegistry(logger);
  const commentPoller = new CommentPoller(adapterRegistry, nats, logger);
  const commentPoster = new CommentPoster(
    adapterRegistry,
    sessionRegistry,
    nats,
    logger,
    env.INTEGRATIONS_SERVICE_URL,
    env.INTERNAL_API_KEY,
  );

  // ---------------------------------------------------------------------------
  // NATS subscribers
  // ---------------------------------------------------------------------------
  const js = nats.getJetStream();

  const mkOpts = (durable: string) => {
    const o = consumerOpts();
    o.durable(durable);
    o.deliverNew();
    o.ackExplicit();
    o.manualAck();
    o.deliverTo(createInbox()); // nats v2: push consumers require a deliver_subject
    return o;
  };

  // Session owner registry: userId of the host per session, used to gate
  // streamer-only socket events (join_as_streamer, video_state, grants).
  // In-memory like the rest of the socket state — when unknown (service
  // restarted mid-session) we still require a valid JWT, just not ownership.
  const sessionOwners = new Map<string, string>();

  // session.created → register accounts in session registry
  const sessionCreatedSub = await js.subscribe(Subjects.SESSION_CREATED, mkOpts('comments-session-created'));
  void (async () => {
    for await (const msg of sessionCreatedSub) {
      try {
        const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<SessionCreatedPayload>;
        sessionOwners.set(event.payload.sessionId, event.payload.userId);
        sessionRegistry.register(
          event.payload.sessionId,
          event.payload.destinationAccountIds.map((id) => ({
            socialAccountId: id as SocialAccountId,
            platform: 'unknown' as SocialPlatform,
          })),
        );
        msg.ack();
      } catch (err) {
        logger.error({ err }, 'Failed to process session.created event');
        msg.nak();
      }
    }
  })();

  // session.starting → resolve real platforms + tokens, then start polling.
  // session.created only carries account IDs (platform 'unknown'); starting a
  // poller with 'unknown' would make every poll throw ADAPTER_NOT_FOUND and
  // error-loop for the whole session without ever fetching a comment.
  const sessionStartingSub = await js.subscribe(Subjects.SESSION_STARTING, mkOpts('comments-session-starting'));
  void (async () => {
    for await (const msg of sessionStartingSub) {
      try {
        const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<{ sessionId: LiveSessionId; userId: string }>;
        if (event.payload.userId) sessionOwners.set(event.payload.sessionId, event.payload.userId);
        const accounts = sessionRegistry.getAccounts(event.payload.sessionId);
        const tokenMap = accounts.length > 0
          ? await commentPoster.fetchTokens(accounts.map((a) => a.socialAccountId))
          : {};
        // Persist resolved platforms back into the registry so the poster's
        // later lookups see real platforms too.
        sessionRegistry.register(
          event.payload.sessionId,
          accounts.map((a) => ({
            socialAccountId: a.socialAccountId,
            platform: (tokenMap[a.socialAccountId]?.platform ?? a.platform) as SocialPlatform,
          })),
        );
        for (const account of accounts) {
          const info = tokenMap[account.socialAccountId];
          if (!info) {
            logger.warn(
              { sessionId: event.payload.sessionId, accountId: account.socialAccountId },
              'No token info for account — skipping comment poller',
            );
            continue;
          }
          commentPoller.start({
            sessionId: event.payload.sessionId,
            socialAccountId: account.socialAccountId,
            platform: info.platform as SocialPlatform,
            accessToken: info.accessToken,
            cursor: null,
            intervalMs: env.COMMENT_POLL_INTERVAL_MS,
          });
        }
        msg.ack();
      } catch (err) {
        logger.error({ err }, 'Failed to process session.starting event');
        msg.nak();
      }
    }
  })();

  // Assigned once the Socket.io state maps exist below; called on session.ended
  // so per-session socket state (viewers, streamer, control grants, reaction
  // windows) doesn't leak for the lifetime of the process.
  let cleanupSessionSocketState: (sessionId: string) => void = () => {};

  // session.ended → stop polling, clean up registry
  const sessionEndedSub = await js.subscribe(Subjects.SESSION_ENDED, mkOpts('comments-session-ended'));
  void (async () => {
    for await (const msg of sessionEndedSub) {
      try {
        const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<{ sessionId: LiveSessionId }>;
        commentPoller.stopAll(event.payload.sessionId);
        sessionRegistry.remove(event.payload.sessionId);
        cleanupSessionSocketState(event.payload.sessionId);
        msg.ack();
      } catch (err) {
        logger.error({ err }, 'Failed to process session.ended event');
        msg.nak();
      }
    }
  })();

  // comment.received → persist, then push to WebSocket clients. Persisting
  // here is what makes GET /comments (history for late joiners / pagination)
  // include platform comments — the poller only publishes to NATS. The unique
  // (session_id, platform, platform_comment_id) constraint makes redeliveries
  // and overlapping poll windows idempotent.
  const commentReceivedSub = await js.subscribe(Subjects.COMMENT_RECEIVED, mkOpts('comments-comment-received'));
  void (async () => {
    for await (const msg of commentReceivedSub) {
      try {
        const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<CommentReceivedPayload>;
        const c = event.payload;
        await db.insert(comments).values({
          id: c.id,
          sessionId: c.sessionId,
          platform: c.platform,
          platformCommentId: c.platformCommentId,
          authorName: c.authorName,
          authorPlatformUserId: c.authorPlatformUserId ?? '',
          authorAvatarUrl: c.authorAvatarUrl ?? null,
          content: c.content,
          mediaUrls: c.mediaUrls ?? null,
          replyToCommentId: c.replyToCommentId ?? null,
          receivedAt: new Date(c.receivedAt),
        }).onConflictDoNothing();
        broadcastComment(c.sessionId, c);
        msg.ack();
      } catch (err) {
        logger.error({ err }, 'Failed to process comment.received event');
        msg.nak();
      }
    }
  })();

  // ---------------------------------------------------------------------------
  // Fastify server
  // ---------------------------------------------------------------------------
  const fastify = Fastify({
    logger: false,
    trustProxy: true,
    ajv: { customOptions: { keywords: ['example'] } },
  });

  await fastify.register(fastifyHelmet);
  await fastify.register(fastifyCors, {
    origin: env.NODE_ENV === 'production'
      ? ['https://tiklivepro.me', 'https://app.tiklivepro.me']
      : true,
    credentials: true,
  });
  await fastify.register(fastifyJwt, { secret: env.JWT_SECRET });

  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'TikLivePro — Comments Service',
        description: `
Real-time comment aggregation service — collects, stores, and serves comments from TikTok and Facebook during live sessions. Also supports posting comments and replying to viewer comments.

## How comments are collected
The \`CommentPoller\` runs a per-session, per-platform polling loop (default interval: **${env.COMMENT_POLL_INTERVAL_MS} ms**):
1. On \`session.starting\` NATS event → starts polling for each destination platform.
2. Fetches new comments since the last cursor using the platform adapter (\`IPlatformAdapter.pollComments\`).
3. Persists each comment to Postgres and publishes a \`comment.received\` NATS event.
4. On \`session.ended\` NATS event → stops all pollers for the session.

## Consuming comments
- **REST:** \`GET /comments?sessionId=<id>\` — paginated historical comments.
- **WebSocket:** \`ws://<host>/comments/ws?sessionId=<id>\` — real-time push feed.

## Posting comments
- **POST /comments** — post to all connected platforms for a session.
- **POST /comments/:id/reply** — reply to a viewer comment on the platform it came from.
        `.trim(),
        version: '1.0.0',
        contact: { name: 'TikLivePro Engineering', email: 'engineering@tiklivepro.pro' },
        license: { name: 'Proprietary' },
      },
      servers: [
        {
          url: 'http://localhost:{port}',
          description: 'Local development',
          variables: { port: { default: String(env.PORT), description: 'Service HTTP port' } },
        },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT access token from POST /auth/login.',
          },
        },
      },
      tags: [
        { name: 'Comments', description: 'Comment retrieval, real-time stream, and posting.' },
        { name: 'Health', description: 'Kubernetes liveness / readiness probes.' },
      ],
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
    },
    staticCSP: true,
  });

  registerCommentsRoutes(fastify, { db, poster: commentPoster });

  // Socket.io must be attached before fastify.listen() so its upgrade listener
  // is registered on the Node.js HTTP server before any connections arrive.
  const io = new SocketIOServer(fastify.server as import('node:http').Server, {
    cors: {
      origin: env.NODE_ENV === 'production'
        ? ['https://tiklivepro.me', 'https://app.tiklivepro.me']
        : true,
    },
    transports: ['websocket'],
  });

  // Per-session viewer registry: socketId → displayName (in-memory, lives for the process lifetime)
  const sessionViewers = new Map<string, Map<string, string>>();
  // Per-session streamer socket ID — direct targeting avoids room-join timing issues
  const sessionStreamers = new Map<string, string>();
  // Per-session set of viewer socket IDs that have been granted video control
  const sessionVideoControlAllowed = new Map<string, Set<string>>();
  // Pending debounce timers — prevents broadcast storms when many viewers join simultaneously
  const pendingViewerBroadcasts = new Map<string, ReturnType<typeof setTimeout>>();
  // Highest viewer count seen this process — avoids a DB write per broadcast.
  // GREATEST() in the upsert keeps the stored peak monotonic across restarts.
  const sessionPeakCache = new Map<string, number>();
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function persistViewerPeak(sid: string, count: number): void {
    // sessionId comes from the socket handshake — skip junk before it hits the uuid column
    if (!UUID_RE.test(sid)) return;
    sessionPeakCache.set(sid, count);
    void db
      .insert(viewerPeaks)
      .values({ sessionId: sid, peakViewers: count })
      .onConflictDoUpdate({
        target: viewerPeaks.sessionId,
        set: {
          // In ON CONFLICT DO UPDATE the table-qualified column resolves to the
          // existing row — GREATEST(existing, incoming) keeps the peak monotonic
          // even when the in-memory cache is empty after a restart.
          peakViewers: sql`GREATEST(${viewerPeaks.peakViewers}, excluded."peak_viewers")`,
          updatedAt: sql`now()`,
        },
      })
      .catch((err: unknown) => logger.error({ err, sid }, 'Failed to persist viewer peak'));
  }

  // Reaction rate limits: unauthenticated sockets can emit reactions, so both
  // per-socket and per-session caps are needed. Each accepted reaction costs a
  // DB insert and a room-wide broadcast — unbounded, N viewers tapping fast is
  // O(N²) socket fan-out and an unbounded insert stream.
  const REACTION_MAX_PER_SOCKET_PER_SEC = 5;
  const REACTION_MAX_PER_SESSION_PER_SEC = 20;
  const socketReactionWindows = new Map<string, { count: number; windowStart: number }>();
  const sessionReactionWindows = new Map<string, { count: number; windowStart: number }>();

  function allowInWindow(
    windows: Map<string, { count: number; windowStart: number }>,
    key: string,
    max: number,
  ): boolean {
    const now = Date.now();
    const entry = windows.get(key);
    if (!entry || now - entry.windowStart >= 1000) {
      windows.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count++;
    return true;
  }

  // Cap the public name list: sending every name to every socket is O(N²)
  // bytes per update window. Viewers still get the exact count via
  // viewer_count; the streamer gets the full list via viewers_update.
  const PUBLIC_VIEWER_LIST_CAP = 50;

  cleanupSessionSocketState = (sid: string): void => {
    sessionViewers.delete(sid);
    sessionStreamers.delete(sid);
    sessionOwners.delete(sid);
    sessionVideoControlAllowed.delete(sid);
    sessionReactionWindows.delete(sid);
    sessionPeakCache.delete(sid);
    const timer = pendingViewerBroadcasts.get(sid);
    if (timer) {
      clearTimeout(timer);
      pendingViewerBroadcasts.delete(sid);
    }
  };

  function broadcastViewersUpdate(sid: string): void {
    // Debounce: cancel any pending broadcast for this session and schedule a new one.
    // 250 ms window collapses bursts of concurrent join/disconnect events into one emit.
    const existing = pendingViewerBroadcasts.get(sid);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      pendingViewerBroadcasts.delete(sid);
      const registry = sessionViewers.get(sid);
      const viewers = registry
        ? Array.from(registry.entries()).map(([id, displayName]) => ({ id, displayName }))
        : [];
      const streamerSocketId = sessionStreamers.get(sid);
      logger.debug({ sid, viewerCount: viewers.length, streamerSocketId: streamerSocketId ?? 'none' }, '[broadcastViewersUpdate] sending viewers_update');
      if (streamerSocketId) {
        io.to(streamerSocketId).emit('viewers_update', { viewers });
      }
      // Record the all-time viewer peak (debounced path — at most one write per
      // 250 ms window, and only when the count actually exceeds the known peak)
      const count = registry?.size ?? 0;
      if (count > (sessionPeakCache.get(sid) ?? 0)) {
        persistViewerPeak(sid, count);
      }

      // Broadcast public-facing count and a capped name list to all clients
      io.to(sid).emit('viewer_count', { count: registry?.size ?? 0 });
      io.to(sid).emit('public_viewers', {
        viewers: viewers.slice(0, PUBLIC_VIEWER_LIST_CAP).map(({ displayName }) => ({ displayName })),
      });
    }, 250);

    pendingViewerBroadcasts.set(sid, timer);
  }

  io.on('connection', (socket) => {
    const { sessionId } = socket.handshake.query as { sessionId?: string };
    logger.debug({ socketId: socket.id, sessionId: sessionId ?? '(none)' }, '[connection] new socket connected');
    if (!sessionId) { socket.disconnect(); return; }
    void socket.join(sessionId);
    logger.info({ sessionId, socketId: socket.id }, 'Comment client connected via Socket.io');

    // Optional handshake auth: viewers may be anonymous, but streamer-only
    // events require a valid JWT. Verified once per connection — clients pass
    // a fresh token on every (re)connect via the socket.io auth callback.
    let authUserId: string | null = null;
    const handshakeToken = (socket.handshake.auth as Record<string, unknown> | undefined)?.['token'];
    if (typeof handshakeToken === 'string' && handshakeToken.length > 0) {
      try {
        const decoded = fastify.jwt.verify<{ sub?: string }>(handshakeToken);
        authUserId = decoded.sub ?? null;
      } catch {
        // Invalid or expired token — treat as an anonymous viewer.
      }
    }

    const isRegisteredStreamer = (): boolean => sessionStreamers.get(sessionId) === socket.id;

    socket.on('emit_reaction', (data: { emoji?: string }) => {
      if (
        !allowInWindow(socketReactionWindows, socket.id, REACTION_MAX_PER_SOCKET_PER_SEC) ||
        !allowInWindow(sessionReactionWindows, sessionId, REACTION_MAX_PER_SESSION_PER_SEC)
      ) {
        return; // silently dropped — the sender already played its local animation
      }
      const emoji = (data?.emoji ?? '❤️').slice(0, 10);
      void (async () => {
        try {
          await db.insert(reactions).values({ id: randomUUID(), sessionId, emoji });
          // Broadcast to all other clients in the session; sender already has local animation
          socket.to(sessionId).emit('reaction', { emoji });
        } catch (err) {
          logger.error({ err, sessionId }, 'Failed to save reaction');
        }
      })();
    });

    // Viewer announces themselves so the streamer can see who is watching
    socket.on('join_as_viewer', (data: unknown) => {
      const d = data as Record<string, unknown> | null;
      const displayName = String(d?.['displayName'] ?? 'Anonymous').slice(0, 50);
      logger.debug({ sessionId, socketId: socket.id, displayName }, '[join_as_viewer] viewer registered');
      if (!sessionViewers.has(sessionId)) sessionViewers.set(sessionId, new Map());
      sessionViewers.get(sessionId)!.set(socket.id, displayName);
      broadcastViewersUpdate(sessionId);
    });

    // Streamer identifies itself — store its socket ID for direct targeting.
    // Guarded: without this check any anonymous viewer could register as the
    // streamer, receive the full viewer name list, and intercept video
    // control commands. Ownership is enforced when the owner is known (from
    // session.created/session.starting); after a service restart mid-session
    // the owner map is empty, so we fall back to requiring a valid JWT.
    socket.on('join_as_streamer', () => {
      if (!authUserId) {
        logger.warn({ sessionId, socketId: socket.id }, '[join_as_streamer] rejected: unauthenticated socket');
        return;
      }
      const ownerId = sessionOwners.get(sessionId);
      if (ownerId && ownerId !== authUserId) {
        logger.warn({ sessionId, socketId: socket.id, authUserId }, '[join_as_streamer] rejected: not the session owner');
        return;
      }
      logger.debug({ sessionId, socketId: socket.id }, '[join_as_streamer] streamer registered');
      sessionStreamers.set(sessionId, socket.id);
      broadcastViewersUpdate(sessionId);
    });

    // Streamer grants or revokes video control for a specific viewer
    socket.on('grant_video_control', (data: unknown) => {
      if (!isRegisteredStreamer()) return;
      const d = data as Record<string, unknown> | null;
      if (!d) return;
      const viewerId = String(d['viewerId'] ?? '');
      const allowed = Boolean(d['allowed']);
      if (!sessionVideoControlAllowed.has(sessionId)) {
        sessionVideoControlAllowed.set(sessionId, new Set());
      }
      const allowedSet = sessionVideoControlAllowed.get(sessionId)!;
      if (allowed) allowedSet.add(viewerId); else allowedSet.delete(viewerId);
      // Notify the specific viewer of their new permission
      io.to(viewerId).emit('video_control_permission', { allowed });
    });

    // Streamer broadcasts current video playback state to all viewers in the session
    socket.on('video_state', (data: unknown) => {
      if (!isRegisteredStreamer()) return;
      const d = data as Record<string, unknown> | null;
      if (!d) return;
      // Forward sourceType: viewers rely on `sourceType === 'camera'` to clear
      // the video-control overlay when the host switches back to camera.
      const sourceType =
        typeof d['sourceType'] === 'string' &&
        ['camera', 'local-file', 'online-url'].includes(d['sourceType'])
          ? d['sourceType']
          : undefined;
      socket.to(sessionId).emit('video_state', {
        ...(sourceType ? { sourceType } : {}),
        playing: Boolean(d['playing']),
        currentTime: Number(d['currentTime'] ?? 0),
        duration: Number(d['duration'] ?? 0),
        allowViewerControl: Boolean(d['allowViewerControl']),
      });
    });

    // Viewer requests a video control action — only forwarded if the viewer has been granted control
    socket.on('video_control_request', (data: unknown) => {
      const d = data as Record<string, unknown> | null;
      if (!d) return;
      const type = String(d['type'] ?? '');
      if (!['play', 'pause', 'seek', 'speed'].includes(type)) return;
      const isAllowed = sessionVideoControlAllowed.get(sessionId)?.has(socket.id) ?? false;
      if (!isAllowed) return;
      const streamerSocketId = sessionStreamers.get(sessionId);
      if (!streamerSocketId) return;
      io.to(streamerSocketId).emit('video_control_command', {
        type,
        viewerId: socket.id,
        ...(d['currentTime'] !== undefined ? { currentTime: Number(d['currentTime']) } : {}),
        ...(d['speed'] !== undefined ? { speed: Number(d['speed']) } : {}),
      });
    });

    socket.on('disconnect', () => {
      // If streamer disconnected, remove their registration
      if (sessionStreamers.get(sessionId) === socket.id) {
        sessionStreamers.delete(sessionId);
        logger.debug({ sessionId, socketId: socket.id }, '[disconnect] streamer disconnected');
      }
      const registry = sessionViewers.get(sessionId);
      if (registry) {
        registry.delete(socket.id);
        if (registry.size === 0) sessionViewers.delete(sessionId);
        broadcastViewersUpdate(sessionId);
      }
      sessionVideoControlAllowed.get(sessionId)?.delete(socket.id);
      socketReactionWindows.delete(socket.id);
    });
  });

  setIo(io);

  fastify.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness probe',
        response: {
          200: { description: 'Service is alive.', type: 'object', properties: { status: { type: 'string', enum: ['ok'] }, service: { type: 'string' } } },
        },
      },
    },
    async () => ({ status: 'ok', service: 'comments' }),
  );

  fastify.get(
    '/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness probe',
        response: {
          200: { description: 'Service is ready.', type: 'object', properties: { status: { type: 'string', enum: ['ready'] } } },
          503: { description: 'Service is not ready.', type: 'object', properties: { status: { type: 'string' }, message: { type: 'string' } } },
        },
      },
    },
    async (_req, reply) => {
      try {
        await pool.query('SELECT 1');
        return { status: 'ready' };
      } catch {
        return reply.status(503).send({ status: 'error', message: 'Database connection failed' });
      }
    },
  );

  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, 'Comments service listening — docs at /docs');

  const shutdown = async (): Promise<void> => {
    io.close();
    commentPoller.stopAll('' as LiveSessionId);
    for (const timer of pendingViewerBroadcasts.values()) clearTimeout(timer);
    pendingViewerBroadcasts.clear();
    await fastify.close();
    await nats.drain();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
}

bootstrap().catch((err: unknown) => {
  logger.error(err, 'Failed to start Comments service');
  process.exit(1);
});
