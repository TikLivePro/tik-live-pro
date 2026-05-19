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
import { registerUsersRoutes } from './interfaces/http/users.routes.js';

const envSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(64),
  CDN_BASE_URL: z.string().url().default('https://cdn.tiklive.pro'),
});

const env = parseEnv(envSchema);
const logger = createLogger('users-service', { level: env.LOG_LEVEL });

async function bootstrap(): Promise<void> {
  const nats = new NatsJetStreamClient();
  await nats.connect({ servers: [env.NATS_URL], name: 'users-service' });
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
        title: 'TikLivePro — Users Service',
        description: `
Manages user profiles and avatars.

## Profile creation
User profiles are **not** created by this service directly. Instead, the service listens for \`auth.user.registered\` NATS events from the Auth Service and creates the matching profile record automatically.

## Managed data
- Display name and locale preferences
- Avatar (stored on CDN at ${env.CDN_BASE_URL})
- Subscription tier (synced from \`billing.entitlement.updated\` events)
- Connected social account count (synced from \`integration.account.connected\` / \`integration.account.disconnected\` events)

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
        { name: 'Users', description: 'User profile management.' },
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

  registerUsersRoutes(fastify);

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
    async () => ({ status: 'ok', service: 'users' }),
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
  logger.info({ port: env.PORT }, 'Users service listening — docs at /docs');

  const shutdown = async (): Promise<void> => {
    await fastify.close();
    await nats.drain();
    process.exit(0);
  };
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
}

bootstrap().catch((err: unknown) => {
  logger.error(err, 'Failed to start Users service');
  process.exit(1);
});
