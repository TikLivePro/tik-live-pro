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
import { reactions } from './infrastructure/db/schema.js';
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
  const pool = new Pool({ connectionString: env.DATABASE_URL });
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

  // session.created → register accounts in session registry
  const sessionCreatedSub = await js.subscribe(Subjects.SESSION_CREATED, mkOpts('comments-session-created'));
  void (async () => {
    for await (const msg of sessionCreatedSub) {
      try {
        const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<SessionCreatedPayload>;
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

  // session.starting → start polling
  const sessionStartingSub = await js.subscribe(Subjects.SESSION_STARTING, mkOpts('comments-session-starting'));
  void (async () => {
    for await (const msg of sessionStartingSub) {
      try {
        const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<{ sessionId: LiveSessionId; userId: string }>;
        const accounts = sessionRegistry.getAccounts(event.payload.sessionId);
        for (const account of accounts) {
          commentPoller.start({
            sessionId: event.payload.sessionId,
            socialAccountId: account.socialAccountId,
            platform: account.platform,
            accessToken: '', // Token will be fetched dynamically by poster; poller uses integrations service
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

  // session.ended → stop polling, clean up registry
  const sessionEndedSub = await js.subscribe(Subjects.SESSION_ENDED, mkOpts('comments-session-ended'));
  void (async () => {
    for await (const msg of sessionEndedSub) {
      try {
        const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<{ sessionId: LiveSessionId }>;
        commentPoller.stopAll(event.payload.sessionId);
        sessionRegistry.remove(event.payload.sessionId);
        msg.ack();
      } catch (err) {
        logger.error({ err }, 'Failed to process session.ended event');
        msg.nak();
      }
    }
  })();

  // comment.received → push to WebSocket clients
  const commentReceivedSub = await js.subscribe(Subjects.COMMENT_RECEIVED, mkOpts('comments-comment-received'));
  void (async () => {
    for await (const msg of commentReceivedSub) {
      try {
        const event = JSON.parse(sc.decode(msg.data)) as BaseEvent<CommentReceivedPayload>;
        broadcastComment(event.payload.sessionId, event.payload);
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
  await fastify.register(fastifyCors, { origin: true });
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
    cors: { origin: true },
    transports: ['websocket'],
  });

  io.on('connection', (socket) => {
    const { sessionId } = socket.handshake.query as { sessionId?: string };
    if (!sessionId) { socket.disconnect(); return; }
    void socket.join(sessionId);
    logger.info({ sessionId }, 'Comment client connected via Socket.io');

    socket.on('emit_reaction', (data: { emoji?: string }) => {
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
