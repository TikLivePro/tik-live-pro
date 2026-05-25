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
import { NatsJetStreamClient, ensureStreams } from '@tik-live-pro/events';
import { registerIntegrationsRoutes } from './interfaces/http/integrations.routes.js';

const envSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(64),
  TIKTOK_CLIENT_KEY: z.string(),
  TIKTOK_CLIENT_SECRET: z.string(),
  FACEBOOK_APP_ID: z.string(),
  FACEBOOK_APP_SECRET: z.string(),
  OAUTH_REDIRECT_BASE_URL: z.string().url(),
  TOKEN_ENCRYPTION_KEY: z.string().min(32),
  INTERNAL_API_KEY: z.string().min(32),
});

const env = parseEnv(envSchema);
const logger = createLogger('integrations-service', { level: env.LOG_LEVEL });

async function bootstrap(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);

  const nats = new NatsJetStreamClient();
  await nats.connect({ servers: [env.NATS_URL], name: 'integrations-service' });
  logger.info({ natsUrl: env.NATS_URL }, 'Connected to NATS');
  await ensureStreams(nats.getJetStreamManager());

  const fastify = Fastify({
    logger: false,
    trustProxy: true,
    ajv: { customOptions: { keywords: ['example'] } },
  });

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
        title: 'TikLivePro — Integrations Service',
        description: `
Manages OAuth connections to social platforms (TikTok and Facebook) and provides token management for the \`stream-orchestrator\`.

## OAuth Flow
\`\`\`
Client → GET /integrations/oauth/{platform}/start  →  302 → Platform Consent Screen
Platform → GET /integrations/oauth/{platform}/callback?code=...&state=...  →  302 → App
\`\`\`

## Token Security
- OAuth access and refresh tokens are encrypted at rest using **AES-256-GCM** before storage.
- Tokens are never returned in API responses — only metadata (display name, platform user ID, connection date) is exposed.
- The \`stream-orchestrator\` fetches decrypted tokens via an internal HTTP call during broadcast initialization.

## Platform Support
| Platform | OAuth Scopes | Token TTL |
|---|---|---|
| TikTok | \`user.info.basic\`, \`live.stream.content\` | Access: 1 day, Refresh: 30 days |
| Facebook | \`publish_video\`, \`pages_manage_posts\` | Access: 60 days (long-lived) |

## Authorization
All endpoints except the OAuth callback require a JWT Bearer token.
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
        { name: 'Integrations', description: 'Connected social account management and OAuth flow.' },
        { name: 'Health', description: 'Kubernetes liveness / readiness probes.' },
      ],
    },
  });

  await fastify.register(fastifySwaggerUi, {
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

  registerIntegrationsRoutes(fastify, {
    db,
    tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
    internalApiKey: env.INTERNAL_API_KEY,
  });

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
    async () => ({ status: 'ok', service: 'integrations' }),
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
  logger.info({ port: env.PORT }, 'Integrations service listening — docs at /docs');

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
  logger.error(err, 'Failed to start Integrations service');
  process.exit(1);
});
