import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { createLogger } from '@tik-live-pro/logger';
import { parseEnv, baseEnvSchema } from '@tik-live-pro/config';
import { NatsJetStreamClient, ensureStreams } from '@tik-live-pro/events';
import { AdapterRegistry, TikTokAdapter, FacebookAdapter } from '@tik-live-pro/platform-adapters';

import { DrizzleStreamSessionRepository } from './infrastructure/db/stream-session.repo.impl.js';
import { FfmpegStreamWorker } from './infrastructure/ffmpeg/ffmpeg-stream-worker.js';
import { RtmpIngestServer } from './infrastructure/rtmp/rtmp-ingest-server.js';
import { IntegrationsTokenProvider } from './infrastructure/http/integrations-token-provider.js';
import { StreamEventPublisher } from './infrastructure/nats/stream-event-publisher.js';
import { SessionEventConsumer } from './infrastructure/nats/session-event-consumer.js';
import { RegisterSessionUseCase } from './application/use-cases/register-session.use-case.js';
import { StartBroadcastUseCase } from './application/use-cases/start-broadcast.use-case.js';
import { StopBroadcastUseCase } from './application/use-cases/stop-broadcast.use-case.js';
import { HandleStreamArrivedUseCase } from './application/use-cases/handle-stream-arrived.use-case.js';
import { registerRoutes } from './interfaces/http/routes.js';

const envSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  RTMP_INGEST_PORT: z.coerce.number().default(1935),
  RTMP_INGEST_HOST: z.string().default('0.0.0.0'),
  INTEGRATIONS_SERVICE_URL: z.string().url(),
  TIKTOK_CLIENT_KEY: z.string(),
  TIKTOK_CLIENT_SECRET: z.string(),
  FACEBOOK_APP_ID: z.string(),
  FACEBOOK_APP_SECRET: z.string(),
  // MediaMTX — platform-native streaming relay (Go binary, ~5 MB RAM)
  // MEDIAMTX_RTMP_URL: internal URL ffmpeg pushes to (container-to-container)
  // MEDIAMTX_HLS_URL:  public URL browsers use to watch the HLS stream
  MEDIAMTX_RTMP_URL: z.string().default('rtmp://localhost:1936'),
  MEDIAMTX_HLS_URL: z.string().default('http://localhost:8888'),
});

const env = parseEnv(envSchema);
const logger = createLogger('stream-orchestrator', { level: env.LOG_LEVEL });

async function main(): Promise<void> {
  // Database
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);

  // NATS
  const nats = new NatsJetStreamClient();
  await nats.connect({
    servers: [env.NATS_URL],
    name: 'stream-orchestrator',
  });
  logger.info('Connected to NATS');
  await ensureStreams(nats.getJetStreamManager());

  // Platform adapters
  const adapterRegistry = new AdapterRegistry();
  adapterRegistry.register(
    new TikTokAdapter(
      { clientKey: env.TIKTOK_CLIENT_KEY, clientSecret: env.TIKTOK_CLIENT_SECRET },
      logger,
    ),
  );
  adapterRegistry.register(
    new FacebookAdapter(
      { appId: env.FACEBOOK_APP_ID, appSecret: env.FACEBOOK_APP_SECRET },
      logger,
    ),
  );

  // Infrastructure
  const sessionRepo = new DrizzleStreamSessionRepository(db);
  const tokenProvider = new IntegrationsTokenProvider(env.INTEGRATIONS_SERVICE_URL, logger);
  const eventPublisher = new StreamEventPublisher(nats);

  const localRtmpBase = `rtmp://127.0.0.1:${env.RTMP_INGEST_PORT}`;

  // Use cases
  const registerSession = new RegisterSessionUseCase(sessionRepo, logger);
  const streamArrivalHandler = new HandleStreamArrivedUseCase(
    sessionRepo,
    eventPublisher,
    () => new FfmpegStreamWorker(logger),
    localRtmpBase,
    env.MEDIAMTX_HLS_URL,
    logger,
  );
  const startBroadcast = new StartBroadcastUseCase(
    sessionRepo,
    tokenProvider,
    adapterRegistry,
    eventPublisher,
    env.MEDIAMTX_RTMP_URL,
    logger,
  );
  const stopBroadcast = new StopBroadcastUseCase(
    sessionRepo,
    tokenProvider,
    adapterRegistry,
    streamArrivalHandler,
    eventPublisher,
    logger,
  );

  // RTMP ingest server
  const rtmpServer = new RtmpIngestServer(env.RTMP_INGEST_PORT, logger);
  rtmpServer.onStreamArrived((ingestKey) => {
    void streamArrivalHandler.execute(ingestKey);
  });
  rtmpServer.onStreamDone((ingestKey) => {
    void streamArrivalHandler.stopWorker(ingestKey);
  });
  rtmpServer.start();

  // NATS event consumer
  const consumer = new SessionEventConsumer(
    nats,
    registerSession,
    startBroadcast,
    stopBroadcast,
    logger,
  );
  consumer.start();

  // HTTP server
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { keywords: ['example'] } },
  });
  await app.register(cors);
  await app.register(helmet);

  // -------------------------------------------------------------------------
  // OpenAPI / Swagger — registered BEFORE routes
  // -------------------------------------------------------------------------
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'TikLivePro — Stream Orchestrator',
        description: `
Internal service that manages RTMP ingest, ffmpeg transcoding workers, and multi-destination broadcast coordination.

## Responsibilities
- Receives RTMP video streams from broadcasting clients (OBS, mobile apps, etc.)
- Spins up ffmpeg workers that re-stream to TikTok and Facebook simultaneously
- Exposes the RTMP ingest URL for a session after it has been registered

## Authorization
Routes marked with the lock icon require a valid JWT Bearer token issued by the **Auth service**.

## Internal communication
This service is primarily driven by NATS JetStream events from the \`live-session\` service:
| Subject | Action |
|---|---|
| \`session.created\` | Register internal session record |
| \`session.starting\` | Start broadcast workers |
| \`session.ending\` | Stop all workers and clean up |
      `.trim(),
        version: '1.0.0',
        contact: { name: 'TikLivePro Engineering', email: 'engineering@tiklivepro.pro' },
        license: { name: 'Proprietary' },
      },
      servers: [
        {
          url: 'http://localhost:{port}',
          description: 'Local development server',
          variables: {
            port: { default: String(env.PORT), description: 'Service HTTP port' },
          },
        },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'JWT access token issued by the Auth service (POST /auth/login). Required on all non-health endpoints.',
          },
        },
      },
      tags: [
        { name: 'Streaming', description: 'RTMP ingest endpoint management.' },
        { name: 'Observability', description: 'Prometheus metrics.' },
        { name: 'Health', description: 'Kubernetes liveness / readiness probes.' },
      ],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
    },
    staticCSP: true,
  });

  registerRoutes(app, {
    sessionRepo,
    streamArrivalHandler,
    rtmpIngestHost: env.RTMP_INGEST_HOST === '0.0.0.0' ? 'localhost' : env.RTMP_INGEST_HOST,
    rtmpIngestPort: env.RTMP_INGEST_PORT,
    mediaMtxHlsUrl: env.MEDIAMTX_HLS_URL,
  });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, 'HTTP server listening');

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    await app.close();
    rtmpServer.stop();
    await nats.drain();
    await pool.end();
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
