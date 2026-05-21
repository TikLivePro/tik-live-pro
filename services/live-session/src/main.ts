import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { parseEnv, baseEnvSchema } from '@tik-live-pro/config';
import { createLogger } from '@tik-live-pro/logger';
import { NatsJetStreamClient } from '@tik-live-pro/events';
import { DrizzleLiveSessionRepository } from './infrastructure/db/live-session.repo.impl.js';
import { CreateSessionUseCase } from './application/use-cases/create-session.use-case.js';
import { StartSessionUseCase } from './application/use-cases/start-session.use-case.js';
import { EndSessionUseCase } from './application/use-cases/end-session.use-case.js';
import { registerLiveSessionRoutes } from './interfaces/http/live-session.routes.js';

const envSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(64),
});

const env = parseEnv(envSchema);
const logger = createLogger('live-session-service', { level: env.LOG_LEVEL });

async function bootstrap(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);

  const nats = new NatsJetStreamClient();
  await nats.connect({ servers: [env.NATS_URL], name: 'live-session-service' });
  logger.info({ natsUrl: env.NATS_URL }, 'Connected to NATS');

  const sessionRepo = new DrizzleLiveSessionRepository(db);
  const createSession = new CreateSessionUseCase(sessionRepo, nats, logger);
  const startSession = new StartSessionUseCase(sessionRepo, nats, logger);
  const endSession = new EndSessionUseCase(sessionRepo, nats, logger);

  const fastify = Fastify({ logger: false, trustProxy: true });

  await fastify.register(fastifyHelmet);
  await fastify.register(fastifyCors, { origin: true });
  await fastify.register(fastifyJwt, { secret: env.JWT_SECRET });

  // ---------------------------------------------------------------------------
  // OpenAPI / Swagger
  // ---------------------------------------------------------------------------
  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'TikLivePro — Live Session Service',
        description: `
Manages the lifecycle of live streaming sessions — from creation through multi-platform broadcasting to teardown.

## Session Lifecycle
\`\`\`
POST /sessions        →  created
POST /sessions/:id/start  →  starting  →  live
POST /sessions/:id/end    →  ending    →  ended
\`\`\`

## Coordination via NATS
This service emits domain events to NATS JetStream that drive other services:
| Subject | Consumer |
|---|---|
| \`session.created\` | stream-orchestrator (pre-allocates RTMP slot) |
| \`session.starting\` | stream-orchestrator (starts ffmpeg workers + platform streams) |
| \`session.starting\` | comments (begins comment polling) |
| \`session.ended\` | stream-orchestrator (stops workers) |
| \`session.ended\` | analytics (finalizes metrics) |

## Authorization
All endpoints require a valid JWT Bearer token (obtained from the Auth Service).
      `.trim(),
        version: '1.0.0',
        contact: { name: 'TikLivePro Engineering', email: 'engineering@tiklive.pro' },
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
            description: 'JWT access token from POST /auth/login. Required on all endpoints.',
          },
        },
      },
      tags: [
        { name: 'Live Sessions', description: 'Session CRUD and lifecycle transitions.' },
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

  registerLiveSessionRoutes(fastify, { createSession, startSession, endSession, sessionRepo });

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
    async () => ({ status: 'ok', service: 'live-session' }),
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
  logger.info({ port: env.PORT }, 'Live Session service listening — docs at /docs');

  const shutdown = async (): Promise<void> => {
    await fastify.close();
    await nats.drain();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
}

bootstrap().catch((err: unknown) => {
  logger.error(err, 'Failed to start Live Session service');
  process.exit(1);
});
