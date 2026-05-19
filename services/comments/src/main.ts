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
import { registerCommentsRoutes } from './interfaces/http/comments.routes.js';

const envSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(64),
  COMMENT_POLL_INTERVAL_MS: z.coerce.number().default(2000),
});

const env = parseEnv(envSchema);
const logger = createLogger('comments-service', { level: env.LOG_LEVEL });

async function bootstrap(): Promise<void> {
  const nats = new NatsJetStreamClient();
  await nats.connect({ servers: [env.NATS_URL], name: 'comments-service' });
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
        title: 'TikLivePro — Comments Service',
        description: `
Real-time comment aggregation service — collects and serves comments from TikTok and Facebook during live sessions.

## How comments are collected
The \`CommentPoller\` runs a per-session, per-platform polling loop (default interval: **${env.COMMENT_POLL_INTERVAL_MS} ms**):
1. On \`session.starting\` NATS event → starts polling for each destination platform.
2. Fetches new comments since the last cursor using the platform adapter (\`IPlatformAdapter.pollComments\`).
3. Persists each comment to Postgres and publishes a \`comment.received\` NATS event.
4. On \`session.ended\` NATS event → stops all pollers for the session.

## Consuming comments
Two mechanisms are available:
- **REST:** \`GET /comments?sessionId=<id>\` — paginated historical comments.
- **WebSocket:** \`ws://<host>/comments/ws?sessionId=<id>\` — real-time push feed.

## Authorization
All endpoints require a JWT Bearer token.
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
            description: 'JWT access token from POST /auth/login.',
          },
        },
      },
      tags: [
        { name: 'Comments', description: 'Comment retrieval and real-time WebSocket stream.' },
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

  registerCommentsRoutes(fastify);

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
        },
      },
    },
    async () => ({ status: 'ready' }),
  );

  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, 'Comments service listening — docs at /docs');

  const shutdown = async (): Promise<void> => {
    await fastify.close();
    await nats.drain();
    process.exit(0);
  };
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
}

bootstrap().catch((err: unknown) => {
  logger.error(err, 'Failed to start Comments service');
  process.exit(1);
});
