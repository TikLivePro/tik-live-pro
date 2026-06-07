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
import { DrizzleRecordingRepository } from './infrastructure/db/recording.repo.impl.js';
import { FfmpegStreamWorker } from './infrastructure/ffmpeg/ffmpeg-stream-worker.js';
import { RtmpIngestServer } from './infrastructure/rtmp/rtmp-ingest-server.js';
import { MediaMtxStreamWatcher } from './infrastructure/mediamtx/mediamtx-stream-watcher.js';
import { IntegrationsTokenProvider } from './infrastructure/http/integrations-token-provider.js';
import { StreamEventPublisher } from './infrastructure/nats/stream-event-publisher.js';
import { SessionEventConsumer } from './infrastructure/nats/session-event-consumer.js';
import { RegisterSessionUseCase } from './application/use-cases/register-session.use-case.js';
import { StartBroadcastUseCase } from './application/use-cases/start-broadcast.use-case.js';
import { StopBroadcastUseCase } from './application/use-cases/stop-broadcast.use-case.js';
import { HandleStreamArrivedUseCase } from './application/use-cases/handle-stream-arrived.use-case.js';
import { registerRoutes } from './interfaces/http/routes.js';
import { RecordingUploader } from './infrastructure/storage/recording-uploader.js';

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
  // MEDIAMTX_RTMP_URL:   internal RTMP URL — ffmpeg reads from here (browser WHIP stream lands here)
  // MEDIAMTX_HLS_URL:    public HLS URL — browsers watch the stream here
  // MEDIAMTX_WEBRTC_URL: public WebRTC URL — browsers push WHIP here
  // MEDIAMTX_API_URL:    internal REST API — stream-orchestrator polls for new paths
  // MEDIAMTX_API_USER / MEDIAMTX_API_PASS — credentials for the MediaMTX REST API
  MEDIAMTX_RTMP_URL: z.string().default('rtmp://localhost:1936'),
  MEDIAMTX_HLS_URL: z.string().default('http://localhost:8888'),
  MEDIAMTX_WEBRTC_URL: z.string().default('http://localhost:8889'),
  MEDIAMTX_API_URL: z.string().default('http://localhost:9997'),
  MEDIAMTX_API_USER: z.string().default(''),
  MEDIAMTX_API_PASS: z.string().default(''),
  // Recording upload — all optional. Leave RECORDING_STORAGE_PROVIDER unset to disable.
  // z.preprocess coerces empty strings (from compose ${VAR:-} expansion) to undefined.
  RECORDINGS_DIR: z.string().default('/recordings'),
  // 'minio' is for local dev only — uses forcePathStyle=true
  RECORDING_STORAGE_PROVIDER: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['do-spaces', 'r2', 'minio']).optional(),
  ),
  RECORDING_STORAGE_BUCKET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().optional(),
  ),
  RECORDING_STORAGE_REGION: z.string().default('auto'),
  RECORDING_STORAGE_ENDPOINT: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().url().optional(),
  ),
  RECORDING_STORAGE_ACCESS_KEY_ID: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().optional(),
  ),
  RECORDING_STORAGE_SECRET_ACCESS_KEY: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().optional(),
  ),
  RECORDING_STORAGE_CDN_URL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().url().optional(),
  ),
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
  const recordingRepo = new DrizzleRecordingRepository(db);
  const tokenProvider = new IntegrationsTokenProvider(env.INTEGRATIONS_SERVICE_URL, logger);
  const eventPublisher = new StreamEventPublisher(nats);

  // Use cases
  const registerSession = new RegisterSessionUseCase(sessionRepo, logger);
  const streamArrivalHandler = new HandleStreamArrivedUseCase(
    sessionRepo,
    eventPublisher,
    () => new FfmpegStreamWorker(logger),
    env.MEDIAMTX_RTMP_URL,  // ffmpeg reads from MediaMTX (browser WHIP stream lands here)
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
  const mediaMtxApiAuthHeader = env.MEDIAMTX_API_USER
    ? `Basic ${Buffer.from(`${env.MEDIAMTX_API_USER}:${env.MEDIAMTX_API_PASS}`).toString('base64')}`
    : undefined;

  const stopBroadcast = new StopBroadcastUseCase(
    sessionRepo,
    tokenProvider,
    adapterRegistry,
    streamArrivalHandler,
    eventPublisher,
    logger,
    env.MEDIAMTX_API_URL,
    mediaMtxApiAuthHeader,
  );

  // RTMP ingest server — kept for OBS / external tool compatibility.
  // Browser streaming uses WebRTC/WHIP → MediaMTX directly.
  const rtmpServer = new RtmpIngestServer(env.RTMP_INGEST_PORT, logger);
  rtmpServer.onStreamArrived((ingestKey) => {
    void streamArrivalHandler.execute(ingestKey);
  });
  rtmpServer.onStreamDone((ingestKey) => {
    void streamArrivalHandler.stopWorker(ingestKey);
  });
  rtmpServer.start();

  // MediaMTX watcher — detects WebRTC/WHIP browser streams arriving on MediaMTX.
  const mediaMtxWatcher = new MediaMtxStreamWatcher(
    env.MEDIAMTX_API_URL,
    async (ingestKey) => {
      await streamArrivalHandler.execute(ingestKey);
    },
    (ingestKey) => void streamArrivalHandler.stopWorker(ingestKey),
    logger,
    env.MEDIAMTX_API_USER,
    env.MEDIAMTX_API_PASS,
  );
  mediaMtxWatcher.start();

  // Recording uploader — optional. Uploads completed .fmp4 segments from the
  // shared mediamtx_recordings volume to object storage (DO Spaces or R2).
  let recordingUploader: RecordingUploader | null = null;
  if (
    env.RECORDING_STORAGE_PROVIDER &&
    env.RECORDING_STORAGE_BUCKET &&
    env.RECORDING_STORAGE_ENDPOINT &&
    env.RECORDING_STORAGE_ACCESS_KEY_ID &&
    env.RECORDING_STORAGE_SECRET_ACCESS_KEY
  ) {
    recordingUploader = new RecordingUploader(
      env.RECORDINGS_DIR,
      {
        bucket: env.RECORDING_STORAGE_BUCKET,
        region: env.RECORDING_STORAGE_REGION,
        endpoint: env.RECORDING_STORAGE_ENDPOINT,
        accessKeyId: env.RECORDING_STORAGE_ACCESS_KEY_ID,
        secretAccessKey: env.RECORDING_STORAGE_SECRET_ACCESS_KEY,
        cdnUrl: env.RECORDING_STORAGE_CDN_URL,
        forcePathStyle: env.RECORDING_STORAGE_PROVIDER === 'minio',
      },
      logger,
      recordingRepo,
      sessionRepo,
    );
    recordingUploader.start();
  } else {
    logger.info('RecordingUploader disabled — RECORDING_STORAGE_PROVIDER not set');
  }

  // NATS event consumer
  const consumer = new SessionEventConsumer(
    nats,
    registerSession,
    startBroadcast,
    stopBroadcast,
    logger,
    sessionRepo,
    env.MEDIAMTX_API_URL,
    mediaMtxApiAuthHeader,
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
    recordingRepo,
    streamArrivalHandler,
    rtmpIngestHost: env.RTMP_INGEST_HOST === '0.0.0.0' ? 'localhost' : env.RTMP_INGEST_HOST,
    rtmpIngestPort: env.RTMP_INGEST_PORT,
    mediaMtxHlsUrl: env.MEDIAMTX_HLS_URL,
    mediaMtxWebrtcUrl: env.MEDIAMTX_WEBRTC_URL,
    mediaMtxApiUrl: env.MEDIAMTX_API_URL,
    mediaMtxApiAuthHeader,
  });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, 'HTTP server listening');

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    await app.close();
    rtmpServer.stop();
    mediaMtxWatcher.stop();
    recordingUploader?.stop();
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
