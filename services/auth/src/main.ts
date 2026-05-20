import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';
import { parseEnv, baseEnvSchema } from '@tik-live-pro/config';
import { createLogger } from '@tik-live-pro/logger';
import { NatsJetStreamClient } from '@tik-live-pro/events';
import { PgAuthUserRepository } from './infrastructure/repositories/pg-auth-user.repository.js';
import { JwtTokenService } from './infrastructure/jwt/jwt-token.service.js';
import { RegisterUseCase } from './application/use-cases/register.use-case.js';
import { LoginUseCase } from './application/use-cases/login.use-case.js';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case.js';
import { OAuthSocialLoginUseCase } from './application/use-cases/oauth-social-login.use-case.js';
import { registerAuthRoutes } from './interfaces/http/auth.routes.js';

const envSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(64),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
});

const env = parseEnv(envSchema);
const logger = createLogger('auth-service', { level: env.LOG_LEVEL });

async function bootstrap(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);

  const nats = new NatsJetStreamClient();
  await nats.connect({ servers: [env.NATS_URL], name: 'auth-service' });
  logger.info({ natsUrl: env.NATS_URL }, 'Connected to NATS');

  const fastify = Fastify({ logger: false, trustProxy: true });

  await fastify.register(fastifyHelmet);
  await fastify.register(fastifyCors, { origin: true });
  await fastify.register(fastifyRateLimit, { max: 100, timeWindow: '1 minute' });
  await fastify.register(fastifyJwt, { secret: env.JWT_SECRET });

  // ---------------------------------------------------------------------------
  // OpenAPI / Swagger — registered BEFORE routes so schemas are captured
  // ---------------------------------------------------------------------------
  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'TikLivePro — Auth Service',
        description: `
JWT-based authentication service for the TikLivePro platform.

## Overview
Manages user registration, login, and token lifecycle. All endpoints are **public** — no Bearer token is required.

## Token flow
| Endpoint | Purpose |
|---|---|
| \`POST /auth/register\` | Create account → returns token pair |
| \`POST /auth/login\` | Authenticate → returns token pair |
| \`POST /auth/refresh\` | Rotate expiring tokens |

## Using tokens
Attach the access token to every protected API call:
\`\`\`
Authorization: Bearer <accessToken>
\`\`\`

## Token TTL
| Token | Default TTL | On expiry |
|---|---|---|
| Access Token | 15 min | Call \`POST /auth/refresh\` |
| Refresh Token | 30 days | Re-authenticate via \`POST /auth/login\` |

## Events emitted (NATS JetStream)
| Subject | Trigger |
|---|---|
| \`auth.user.registered\` | Successful registration |
| \`auth.user.logged_in\` | Successful login |
        `.trim(),
        version: '1.0.0',
        contact: { name: 'TikLivePro Engineering', email: 'engineering@tiklive.pro' },
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
      tags: [
        {
          name: 'Authentication',
          description:
            'User registration and session management. All endpoints are public — no Bearer token required.',
        },
        {
          name: 'Health',
          description: 'Kubernetes liveness and readiness probes.',
        },
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

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------
  const userRepo = new PgAuthUserRepository(db, logger);
  const tokenService = new JwtTokenService(
    fastify,
    db,
    env.JWT_ACCESS_EXPIRES_IN,
    env.JWT_REFRESH_EXPIRES_IN,
    logger,
  );

  const registerUseCase = new RegisterUseCase(userRepo, tokenService, nats, logger);
  const loginUseCase = new LoginUseCase(userRepo, tokenService, nats, logger);
  const refreshTokenUseCase = new RefreshTokenUseCase(userRepo, tokenService, logger);
  const oauthSocialLoginUseCase = new OAuthSocialLoginUseCase(userRepo, tokenService, nats, logger);

  registerAuthRoutes(fastify, {
    registerUseCase,
    loginUseCase,
    refreshTokenUseCase,
    oauthSocialLoginUseCase,
  });

  // ---------------------------------------------------------------------------
  // Health endpoints
  // ---------------------------------------------------------------------------
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description:
          'Returns `ok` immediately. Used by Kubernetes to determine if the pod is alive.',
        response: {
          200: {
            description: 'Service is alive.',
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok'], example: 'ok' },
              service: { type: 'string', example: 'auth' },
            },
          },
        },
      },
    },
    async () => ({ status: 'ok', service: 'auth' }),
  );

  fastify.get(
    '/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description:
          'Checks database connectivity. Returns `ready` only when a DB query succeeds. Used by Kubernetes to gate traffic.',
        response: {
          200: {
            description: 'Service is ready to accept traffic.',
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ready'], example: 'ready' },
            },
          },
          503: {
            description: 'Service is not ready (DB unreachable).',
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['error'], example: 'error' },
              message: { type: 'string', example: 'Database connection failed' },
            },
          },
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
  logger.info({ port: env.PORT }, 'Auth service listening — docs at /docs');

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    await fastify.close();
    await nats.drain();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });
}

bootstrap().catch((err: unknown) => {
  logger.error(err, 'Failed to start auth service');
  process.exit(1);
});
