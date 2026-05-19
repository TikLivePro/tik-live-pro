import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { z } from 'zod';
import { parseEnv, baseEnvSchema } from '@tik-live-pro/config';
import { createLogger } from '@tik-live-pro/logger';
import { NatsJetStreamClient } from '@tik-live-pro/events';
import { registerLiveSessionRoutes } from './interfaces/http/live-session.routes.js';

const envSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(64),
});

const env = parseEnv(envSchema);
const logger = createLogger('live-session-service', { level: env.LOG_LEVEL });

async function bootstrap(): Promise<void> {
  const nats = new NatsJetStreamClient();
  await nats.connect({ servers: [env.NATS_URL], name: 'live-session-service' });
  logger.info({ natsUrl: env.NATS_URL }, 'Connected to NATS');

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
| \`session.ending\` | stream-orchestrator (stops workers) |
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

  registerLiveSessionRoutes(fastify);

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
        },
      },
    },
    async () => ({ status: 'ready' }),
  );

  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, 'Live Session service listening — docs at /docs');

  const shutdown = async (): Promise<void> => {
    await fastify.close();
    await nats.drain();
    process.exit(0);
  };
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
}

bootstrap().catch((err: unknown) => {
  logger.error(err, 'Failed to start Live Session service');
  process.exit(1);
});
