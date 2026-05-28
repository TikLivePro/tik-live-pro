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
import { registerBillingRoutes } from './interfaces/http/billing.routes.js';

const envSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(64),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  STRIPE_PREMIUM_PRICE_ID: z.string(),
});

const env = parseEnv(envSchema);
const logger = createLogger('billing-service', { level: env.LOG_LEVEL });

async function bootstrap(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);

  const nats = new NatsJetStreamClient();
  await nats.connect({ servers: [env.NATS_URL], name: 'billing-service' });
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
        title: 'TikLivePro — Billing Service',
        description: `
Manages Stripe subscriptions and resolves user entitlements (features, account limits).

## Subscription Tiers
| Tier | Price | Features |
|---|---|---|
| **Free** | $0 / mo | 2 social accounts, basic streaming |
| **Premium** | $9.99 / mo | Unlimited accounts, analytics, comment moderation, stream recording |

## Entitlement Model
Entitlements are the **resolved** view of what a user is allowed to do. They are:
1. Seeded at registration (FREE defaults)
2. Updated when a Stripe subscription event arrives via webhook
3. Cached in Postgres and broadcast via \`billing.entitlement.updated\` NATS events

**Other services must not** query subscription status directly — they should consume the NATS event or call \`GET /billing/entitlements\`.

## Stripe Integration
Payments are handled entirely by Stripe Checkout. The billing service stores no card data.
Stripe communicates billing events via signed webhooks to \`POST /billing/webhooks/stripe\`.

## Authorization
All endpoints except \`POST /billing/webhooks/stripe\` require a JWT Bearer token.
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
        { name: 'Billing', description: 'Subscriptions, entitlements, and Stripe Checkout.' },
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

  registerBillingRoutes(fastify, { db });

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
    async () => ({ status: 'ok', service: 'billing' }),
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
  logger.info({ port: env.PORT }, 'Billing service listening — docs at /docs');

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
  logger.error(err, 'Failed to start Billing service');
  process.exit(1);
});
