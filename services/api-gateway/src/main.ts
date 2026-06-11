import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { z } from 'zod';
import { parseEnv, baseEnvSchema } from '@tik-live-pro/config';
import { createLogger } from '@tik-live-pro/logger';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

const envSchema = baseEnvSchema.extend({
  JWT_SECRET: z.string().min(64),
  AUTH_SERVICE_URL: z.string().url(),
  USER_SERVICE_URL: z.string().url(),
  SESSION_SERVICE_URL: z.string().url(),
  BILLING_SERVICE_URL: z.string().url(),
  INTEGRATION_SERVICE_URL: z.string().url(),
  COMMENTS_SERVICE_URL: z.string().url(),
  NOTIFICATIONS_SERVICE_URL: z.string().url(),
  ANALYTICS_SERVICE_URL: z.string().url(),
  STREAM_ORCHESTRATOR_SERVICE_URL: z.string().url(),
});

const env = parseEnv(envSchema);
const logger = createLogger('api-gateway', { level: env.LOG_LEVEL });

const SERVICE_ROUTES: Record<string, string> = {
  '/auth': env.AUTH_SERVICE_URL,
  '/users': env.USER_SERVICE_URL,
  '/sessions': env.SESSION_SERVICE_URL,
  '/billing': env.BILLING_SERVICE_URL,
  '/integrations': env.INTEGRATION_SERVICE_URL,
  '/comments': env.COMMENTS_SERVICE_URL,
  '/notifications': env.NOTIFICATIONS_SERVICE_URL,
  '/analytics': env.ANALYTICS_SERVICE_URL,
  '/stream-orchestrator': env.STREAM_ORCHESTRATOR_SERVICE_URL,
};

// Routes whose prefix is stripped before forwarding to the upstream.
// The upstream service registers routes without the gateway prefix.
// Example: GET /stream-orchestrator/sessions/:id/ingest → upstream receives /sessions/:id/ingest.
const STRIP_PREFIX_ROUTES = new Set(['/stream-orchestrator']);

const PUBLIC_PREFIXES = new Set(['/auth']);

// Exact paths publicly accessible without a JWT (within otherwise-protected prefixes).
const PUBLIC_PATHS = new Set([
  '/billing/plans',
  '/stream-orchestrator/video-proxy/merge-stream',
]);
// Pattern-matched public paths (e.g. /sessions/:id/public — shared watch pages).
const PUBLIC_PATH_PATTERNS = [
  /^\/sessions\/[^/]+\/public$/,
  /^\/sessions\/[^/]+\/viewers$/,
];
// GET-only paths that are publicly readable (no auth required for safe read operations).
// POST/PATCH/DELETE to the same paths still require auth (enforced below).
const PUBLIC_GET_PATHS = new Set(['/comments']);

async function bootstrap(): Promise<void> {
  const fastify = Fastify({
    logger: false,
    trustProxy: true,
    ajv: { customOptions: { keywords: ['example'] } },
  });

  await fastify.register(fastifyHelmet, {
    // In development the web app (localhost:3010) and API gateway (localhost:3000)
    // are on different ports — treated as cross-origin by browsers. Allow cross-origin
    // resource loading so video elements can load merge-stream responses directly.
    // In production everything is served behind the same domain (Caddy), so
    // same-origin is correct and provides the proper security boundary.
    crossOriginResourcePolicy: {
      policy: env.NODE_ENV === 'development' ? 'cross-origin' : 'same-origin',
    },
  });
  await fastify.register(fastifyCors, { origin: true });
  await fastify.register(fastifyRateLimit, { max: 500, timeWindow: '1 minute' });
  await fastify.register(fastifyJwt, { secret: env.JWT_SECRET });

  // ---------------------------------------------------------------------------
  // OpenAPI / Swagger (static spec — gateway is a proxy, routes have no schemas)
  // This document is the single authoritative external-facing API reference.
  // ---------------------------------------------------------------------------
  await fastify.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'TikLivePro — Public API',
        description: `
The TikLivePro API Gateway is the single entry point for all client traffic (web, mobile, and third-party integrations).

## Architecture
The gateway authenticates requests using JWT Bearer tokens and forwards them to the appropriate microservice:

| Path prefix | Downstream service | Auth required |
|---|---|---|
| \`/auth/*\` | Auth Service | No |
| \`/users/*\` | Users Service | Yes |
| \`/sessions/*\` | Live Session Service | Yes |
| \`/integrations/*\` | Integrations Service | Yes |
| \`/billing/*\` | Billing Service | Yes |
| \`GET /comments\` | Comments Service | No — public read for live viewers |
| \`POST /comments\` | Comments Service | Yes |
| \`/comments/*\` | Comments Service | Yes |
| \`/notifications/*\` | Notifications Service | Yes |
| \`/analytics/*\` | Analytics Service | Yes |

## Authentication
All protected routes require a valid JWT in the \`Authorization\` header:
\`\`\`
Authorization: Bearer <accessToken>
\`\`\`

Obtain a token via **POST /auth/login** or **POST /auth/register**.
Refresh an expired token via **POST /auth/refresh**.

## Rate limiting
The gateway enforces a global rate limit of **500 requests/minute** per IP address.
Individual services may apply additional rate limits.

## Correlation IDs
Every request is assigned a \`x-correlation-id\` UUID header if one is not already present.
Include this header in bug reports or support requests to trace a specific request across all services.

## Error format
All error responses follow a consistent envelope:
\`\`\`json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable explanation"
  }
}
\`\`\`
      `.trim(),
        version: '1.0.0',
        contact: { name: 'TikLivePro Engineering', email: 'engineering@tiklivepro.pro' },
        license: { name: 'Proprietary' },
      },
      servers: env.NODE_ENV === 'production'
        ? [
            { url: 'https://api.tiklivepro.pro', description: 'Production' },
            { url: 'https://api.staging.tiklivepro.pro', description: 'Staging' },
            {
              url: 'http://localhost:{port}',
              description: 'Local development',
              variables: { port: { default: String(env.PORT), description: 'Gateway HTTP port' } },
            },
          ]
        : [
            {
              url: 'http://localhost:{port}',
              description: 'Local development',
              variables: { port: { default: String(env.PORT), description: 'Gateway HTTP port' } },
            },
            { url: 'https://api.staging.tiklivepro.pro', description: 'Staging' },
            { url: 'https://api.tiklivepro.pro', description: 'Production' },
          ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'JWT access token obtained from POST /auth/login or POST /auth/register. Valid for 15 minutes. Renew via POST /auth/refresh.',
          },
        },
        schemas: {
          ApiError: {
            type: 'object',
            required: ['error'],
            properties: {
              error: {
                type: 'object',
                required: ['code', 'message'],
                properties: {
                  code: { type: 'string', example: 'NOT_FOUND' },
                  message: { type: 'string', example: 'Resource not found' },
                },
              },
            },
          },
          TokenPair: {
            type: 'object',
            required: ['userId', 'accessToken', 'refreshToken'],
            properties: {
              userId: { type: 'string', format: 'uuid', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
              accessToken: { type: 'string', description: 'JWT — expires in 15 min.', example: 'eyJhbGciOiJIUzI1NiJ9...' },
              refreshToken: { type: 'string', description: 'Opaque token — expires in 30 days.', example: 'dGhpc2lzYXJlZnJlc2h0b2tlbg==' },
              accessTokenExpiresAt: { type: 'string', format: 'date-time', example: '2026-05-19T10:15:00.000Z' },
              refreshTokenExpiresAt: { type: 'string', format: 'date-time', example: '2026-06-18T10:00:00.000Z' },
            },
          },
          User: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              displayName: { type: 'string', example: 'Alice Streamer' },
              avatarUrl: { type: 'string', format: 'uri', nullable: true },
              subscriptionTier: { type: 'string', enum: ['free', 'premium'], example: 'free' },
              locale: { type: 'string', example: 'en' },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
          SocialAccount: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              platform: { type: 'string', enum: ['tiktok', 'facebook'] },
              platformUserId: { type: 'string' },
              displayName: { type: 'string' },
              avatarUrl: { type: 'string', format: 'uri', nullable: true },
              isActive: { type: 'boolean' },
              connectedAt: { type: 'string', format: 'date-time' },
            },
          },
          LiveSession: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              userId: { type: 'string', format: 'uuid' },
              title: { type: 'string', example: 'Morning coding stream' },
              description: { type: 'string', nullable: true },
              status: {
                type: 'string',
                enum: ['created', 'starting', 'live', 'paused', 'ending', 'ended', 'error'],
              },
              destinations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    socialAccountId: { type: 'string', format: 'uuid' },
                    platform: { type: 'string', enum: ['tiktok', 'facebook'] },
                    status: { type: 'string', enum: ['pending', 'connecting', 'live', 'error', 'ended'] },
                  },
                },
              },
              shouldRecord: {
                type: 'boolean',
                description: 'Whether this session is being saved to cloud storage. Requires an active subscription with stream_recording.',
                example: false,
              },
              startedAt: { type: 'string', format: 'date-time', nullable: true },
              endedAt: { type: 'string', format: 'date-time', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          Comment: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              sessionId: { type: 'string', format: 'uuid' },
              platform: { type: 'string', enum: ['tiktok', 'facebook'] },
              platformCommentId: { type: 'string' },
              authorName: { type: 'string', example: 'Bob Viewer' },
              authorAvatarUrl: { type: 'string', format: 'uri', nullable: true },
              content: { type: 'string', example: 'Great stream!' },
              receivedAt: { type: 'string', format: 'date-time' },
            },
          },
          Subscription: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              userId: { type: 'string', format: 'uuid' },
              tier: { type: 'string', enum: ['free', 'premium'] },
              status: { type: 'string', enum: ['active', 'canceled', 'past_due', 'trialing'] },
              currentPeriodStart: { type: 'string', format: 'date-time' },
              currentPeriodEnd: { type: 'string', format: 'date-time' },
              canceledAt: { type: 'string', format: 'date-time', nullable: true },
            },
          },
          Entitlement: {
            type: 'object',
            properties: {
              userId: { type: 'string', format: 'uuid' },
              tier: { type: 'string', enum: ['free', 'premium'] },
              features: {
                type: 'array',
                items: { type: 'string', enum: ['unlimited_accounts', 'analytics_dashboard', 'comment_moderation', 'stream_recording'] },
              },
              maxSocialAccounts: { type: 'integer', example: 2 },
            },
          },
          Notification: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              type: { type: 'string', enum: ['session_started', 'session_ended', 'stream_error', 'billing_event'] },
              title: { type: 'string', example: 'Stream started' },
              body: { type: 'string', example: 'Your live session is now live on TikTok and Facebook.' },
              isRead: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      tags: [
        { name: 'Authentication', description: 'Register, log in, and manage JWT tokens.' },
        { name: 'Users', description: 'User profile management.' },
        { name: 'Live Sessions', description: 'Create and control live streaming sessions.' },
        { name: 'Integrations', description: 'Connect and manage TikTok and Facebook accounts.' },
        { name: 'Billing', description: 'Subscriptions, entitlements, and Stripe checkout.' },
        { name: 'Comments', description: 'Real-time comment aggregation from all platforms.' },
        { name: 'Notifications', description: 'In-app notification management.' },
        { name: 'Analytics', description: 'Session and account performance analytics.' },
        { name: 'Health', description: 'Gateway health and readiness probes.' },
      ],
      paths: {
        // -----------------------------------------------------------------------
        // AUTH
        // -----------------------------------------------------------------------
        '/auth/register': {
          post: {
            tags: ['Authentication'],
            summary: 'Register a new user',
            description: 'Creates a new account and returns a JWT access/refresh token pair. No authorization required.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['email', 'password', 'displayName'],
                    properties: {
                      email: { type: 'string', format: 'email', example: 'alice@example.com' },
                      password: { type: 'string', minLength: 8, example: 'Sup3rS3cret!' },
                      displayName: { type: 'string', minLength: 2, maxLength: 50, example: 'Alice Streamer' },
                      locale: { type: 'string', default: 'en', example: 'fr' },
                    },
                  },
                },
              },
            },
            responses: {
              201: { description: 'Account created.', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/TokenPair' } } } } } },
              409: { description: 'Email already registered.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/auth/login': {
          post: {
            tags: ['Authentication'],
            summary: 'Log in',
            description: 'Authenticate with email + password and receive a JWT token pair. No authorization required.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                      email: { type: 'string', format: 'email', example: 'alice@example.com' },
                      password: { type: 'string', example: 'Sup3rS3cret!' },
                    },
                  },
                },
              },
            },
            responses: {
              200: { description: 'Login successful.', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/TokenPair' } } } } } },
              401: { description: 'Invalid credentials.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/auth/refresh': {
          post: {
            tags: ['Authentication'],
            summary: 'Refresh access token',
            description: 'Exchange a refresh token for a new access/refresh pair. The old refresh token is rotated (invalidated). No authorization required.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['refreshToken'],
                    properties: { refreshToken: { type: 'string', example: 'dGhpc2lzYXJlZnJlc2h0b2tlbg==' } },
                  },
                },
              },
            },
            responses: {
              200: { description: 'Token rotated.', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/TokenPair' } } } } } },
              401: { description: 'Refresh token invalid or expired.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },

        // -----------------------------------------------------------------------
        // USERS
        // -----------------------------------------------------------------------
        '/users/me': {
          get: {
            tags: ['Users'],
            summary: 'Get current user profile',
            description: 'Returns the full profile of the authenticated user including social account count.',
            security: [{ BearerAuth: [] }],
            responses: {
              200: { description: 'User profile.', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/User' } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
          patch: {
            tags: ['Users'],
            summary: 'Update user profile',
            description: 'Partially updates the authenticated user\'s profile. Only provided fields are changed.',
            security: [{ BearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      displayName: { type: 'string', minLength: 2, maxLength: 50, example: 'Alice Pro' },
                      locale: { type: 'string', example: 'fr' },
                    },
                  },
                },
              },
            },
            responses: {
              200: { description: 'Profile updated.', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/User' } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/users/me/avatar': {
          post: {
            tags: ['Users'],
            summary: 'Upload avatar',
            description: 'Uploads a new profile picture. Accepts JPEG or PNG up to 5 MB. The image is resized to 256×256 before storage.',
            security: [{ BearerAuth: [] }],
            requestBody: {
              required: true,
              content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'Image file (JPEG or PNG, max 5 MB).' } } } } },
            },
            responses: {
              200: { description: 'Avatar uploaded.', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object', properties: { avatarUrl: { type: 'string', format: 'uri', example: 'https://cdn.tiklivepro.pro/avatars/abc.jpg' } } } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              413: { description: 'File too large (> 5 MB).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },

        // -----------------------------------------------------------------------
        // INTEGRATIONS
        // -----------------------------------------------------------------------
        '/integrations/accounts': {
          get: {
            tags: ['Integrations'],
            summary: 'List connected social accounts',
            description: 'Returns all social accounts (TikTok, Facebook) connected to the authenticated user.',
            security: [{ BearerAuth: [] }],
            responses: {
              200: {
                description: 'List of connected accounts.',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        data: { type: 'array', items: { $ref: '#/components/schemas/SocialAccount' } },
                      },
                    },
                  },
                },
              },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/integrations/accounts/{accountId}': {
          delete: {
            tags: ['Integrations'],
            summary: 'Disconnect a social account',
            description: 'Revokes and removes a connected social account. Any active sessions using this account will be stopped.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'path', name: 'accountId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'ID of the social account to disconnect.' },
            ],
            responses: {
              204: { description: 'Account disconnected.' },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              403: { description: 'Account belongs to a different user.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              404: { description: 'Account not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/integrations/oauth/{platform}/start': {
          get: {
            tags: ['Integrations'],
            summary: 'Start OAuth flow',
            description: 'Redirects the user to the platform OAuth consent screen. Supported platforms: `tiktok`, `facebook`.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'path', name: 'platform', required: true, schema: { type: 'string', enum: ['tiktok', 'facebook'] }, description: 'Target social platform.' },
            ],
            responses: {
              200: {
                description: 'OAuth authorization URL to redirect the user to.',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            authUrl: { type: 'string', format: 'uri', description: 'Redirect the user here to begin OAuth authorization.' },
                          },
                        },
                      },
                    },
                  },
                },
              },
              400: { description: 'Unsupported platform.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              422: { description: 'Entitlement limit reached (free plan allows 2 accounts).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/integrations/oauth/{platform}/callback': {
          get: {
            tags: ['Integrations'],
            summary: 'OAuth callback',
            description: 'Callback endpoint invoked by the platform after the user approves OAuth access. Exchanges the authorization code for tokens and stores the connected account.',
            parameters: [
              { in: 'path', name: 'platform', required: true, schema: { type: 'string', enum: ['tiktok', 'facebook'] }, description: 'Platform that completed the OAuth flow.' },
              { in: 'query', name: 'code', required: true, schema: { type: 'string' }, description: 'Authorization code from the platform.' },
              { in: 'query', name: 'state', required: true, schema: { type: 'string' }, description: 'CSRF state token.' },
            ],
            responses: {
              302: { description: 'Redirect to the app on success.' },
              400: { description: 'Invalid state or missing code.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },

        '/integrations/webhooks/tiktok': {
          get: {
            tags: ['Integrations'],
            summary: 'TikTok webhook challenge verification',
            description: 'One-time endpoint called by TikTok when the Callback URL is saved in the developer portal. Echoes the `challenge` query parameter back to complete verification. Do not call directly.',
            parameters: [
              { in: 'query', name: 'challenge', required: false, schema: { type: 'string' }, description: 'Opaque token sent by TikTok. Echoed back in the response body.' },
            ],
            responses: {
              200: { description: 'Challenge echoed back.', content: { 'application/json': { schema: { type: 'object', properties: { challenge: { type: 'string' } } } } } },
            },
          },
          post: {
            tags: ['Integrations'],
            summary: 'TikTok webhook event receiver',
            description: 'Receives push events from TikTok. All requests are validated with HMAC-SHA256 (`X-TikTok-Signature` header). Handled events: `user.authorization.revoke` (marks account inactive, publishes `integration.account.disconnected`) and `live.session.ended` (publishes `integration.platform.session_ended`). Do not call directly.',
            responses: {
              200: { description: 'Event acknowledged.', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
              400: { description: 'Invalid HMAC signature.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },

        // -----------------------------------------------------------------------
        // LIVE SESSIONS
        // -----------------------------------------------------------------------
        '/sessions': {
          get: {
            tags: ['Live Sessions'],
            summary: 'List sessions',
            description: 'Returns all live sessions for the authenticated user, sorted newest first.',
            security: [{ BearerAuth: [] }],
            responses: {
              200: { description: 'Session list.', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/LiveSession' } } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
          post: {
            tags: ['Live Sessions'],
            summary: 'Create a live session',
            description: 'Creates a new live session. Social account destinations are optional — omit them to go live without broadcasting to any platform. Only one active session per user is allowed. If the user has an active subscription with stream_recording, the session will be saved to cloud storage.',
            security: [{ BearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['title'],
                    properties: {
                      title: { type: 'string', minLength: 1, maxLength: 100, example: 'Morning coding stream' },
                      description: { type: 'string', maxLength: 500, example: 'Building a live streaming platform live!' },
                      destinationAccountIds: {
                        type: 'array',
                        minItems: 0,
                        items: { type: 'string', format: 'uuid' },
                        description: 'IDs of connected social accounts to stream to. Omit or pass an empty array to go live without broadcasting to any social platform.',
                        example: ['c3d4e5f6-a7b8-9012-cdef-123456789012'],
                      },
                    },
                  },
                },
              },
            },
            responses: {
              201: { description: 'Session created.', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object', properties: { sessionId: { type: 'string', format: 'uuid' } } } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              409: { description: 'User already has an active session.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/sessions/{sessionId}': {
          get: {
            tags: ['Live Sessions'],
            summary: 'Get session details',
            description: 'Returns the current state and metadata of a live session.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'path', name: 'sessionId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Live session ID.' },
            ],
            responses: {
              200: { description: 'Session details.', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/LiveSession' } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              403: { description: 'Session belongs to another user.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              404: { description: 'Session not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
          patch: {
            tags: ['Live Sessions'],
            summary: 'Update session settings',
            description: 'Partially updates mutable session settings. Supports toggling `viewersVisible` to show or hide the audience list on the public watch page.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'path', name: 'sessionId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Live session ID.' },
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      viewersVisible: { type: 'boolean', description: 'Whether to expose the viewer list on the public watch page.' },
                    },
                  },
                },
              },
            },
            responses: {
              204: { description: 'Update applied.' },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              403: { description: 'Session belongs to another user.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              404: { description: 'Session not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/sessions/{sessionId}/public': {
          get: {
            tags: ['Live Sessions'],
            summary: 'Get public session info',
            description: 'Returns limited, public-facing session info (title, status, platforms, timestamps, viewersVisible). No authentication required. Used for shared watch pages.',
            parameters: [
              { in: 'path', name: 'sessionId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Live session ID.' },
            ],
            responses: {
              200: { description: 'Public session info.', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string' }, platforms: { type: 'array', items: { type: 'string' } }, platformHlsUrl: { type: 'string', nullable: true }, startedAt: { type: 'string', nullable: true }, endedAt: { type: 'string', nullable: true }, viewersVisible: { type: 'boolean' }, viewerCount: { type: 'integer' } } } } } } } },
              404: { description: 'Session not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/sessions/{sessionId}/viewers': {
          get: {
            tags: ['Live Sessions'],
            summary: 'Get session viewers',
            description: 'Returns the list of current viewers. No authentication required. Only populated when the broadcaster has enabled `viewersVisible`.',
            parameters: [
              { in: 'path', name: 'sessionId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Live session ID.' },
            ],
            responses: {
              200: { description: 'Viewer list.', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object', properties: { viewers: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, displayName: { type: 'string' }, joinedAt: { type: 'string' } } } }, total: { type: 'integer' } } } } } } } },
              404: { description: 'Session not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/sessions/{sessionId}/start': {
          post: {
            tags: ['Live Sessions'],
            summary: 'Start a session',
            description: 'Transitions the session from `created` → `starting` and triggers multi-platform broadcast via NATS. After calling this, retrieve the RTMP ingest URL and begin pushing your video stream.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'path', name: 'sessionId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Live session ID.' },
            ],
            responses: {
              204: { description: 'Session starting. Poll GET /sessions/{sessionId} for status.' },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              404: { description: 'Session not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              409: { description: 'Session is not in `created` status.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/sessions/{sessionId}/end': {
          post: {
            tags: ['Live Sessions'],
            summary: 'End a session',
            description: 'Gracefully terminates the live session, stops all ffmpeg workers, and ends the broadcast on all platforms.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'path', name: 'sessionId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Live session ID.' },
            ],
            responses: {
              204: { description: 'Session ending.' },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              404: { description: 'Session not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              409: { description: 'Session is not in `live` or `starting` status.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },

        // -----------------------------------------------------------------------
        // STREAM ORCHESTRATOR
        // -----------------------------------------------------------------------
        '/stream-orchestrator/recordings/completed': {
          get: {
            tags: ['Streaming'],
            summary: 'List completed recordings by session IDs',
            description: 'Returns all uploaded recording files for the given comma-separated session IDs, sorted newest-first.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'query', name: 'sessionIds', required: false, schema: { type: 'string' }, description: 'Comma-separated list of session UUIDs.' },
            ],
            responses: {
              200: { description: 'Completed recordings list.', content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, sessionId: { type: 'string' }, fileName: { type: 'string' }, publicUrl: { type: 'string' }, sizeBytes: { type: 'number' }, createdAt: { type: 'string', format: 'date-time' } } } } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },

        '/stream-orchestrator/sessions/{sessionId}/ingest': {
          get: {
            tags: ['Streaming'],
            summary: 'Get ingest endpoint',
            description: 'Returns the RTMP ingest URL, WHIP URL, HLS URL, and stream key for a session that is ready to receive a video stream. Poll until status is `waiting_for_stream` before starting WHIP/RTMP.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'path', name: 'sessionId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Live session ID.' },
            ],
            responses: {
              200: { description: 'Ingest endpoint ready.', content: { 'application/json': { schema: { type: 'object', required: ['ingestUrl', 'ingestKey', 'hlsUrl', 'whipUrl', 'status'], properties: { ingestUrl: { type: 'string' }, ingestKey: { type: 'string' }, hlsUrl: { type: 'string' }, whipUrl: { type: 'string' }, status: { type: 'string', enum: ['waiting_for_stream', 'live', 'ending', 'ended', 'error'] } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              404: { description: 'Session not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              409: { description: 'Ingest not ready yet (session is idle or starting). Retry after a short delay.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/stream-orchestrator/sessions/{sessionId}/video-push': {
          post: {
            tags: ['Streaming'],
            summary: 'Push a remote video URL into the RTMP stream',
            description: 'Accepts an HTTP or HTTPS URL (or a YouTube/Twitch/Vimeo/Dailymotion platform link) and starts an ffmpeg process that fetches and pushes it into the session RTMP ingest key. Platform links are resolved via yt-dlp. The file loops until the session ends or a new video-push replaces it. Only valid when session status is `live`.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'path', name: 'sessionId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Live session ID.' },
            ],
            requestBody: {
              required: true,
              content: { 'application/json': { schema: { type: 'object', required: ['videoUri'], properties: { videoUri: { type: 'string', description: 'HTTP/HTTPS URL or platform link (YouTube, Twitch, Vimeo, Dailymotion).', example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } } } } },
            },
            responses: {
              200: { description: 'Video push started.', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['started'] } } } } } },
              400: { description: 'videoUri missing or not a valid HTTP/HTTPS URL.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              404: { description: 'Session not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              409: { description: 'Session is not live.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              422: { description: 'Platform URL could not be resolved (video unavailable or yt-dlp error).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              503: { description: 'yt-dlp is not installed on this server.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              504: { description: 'yt-dlp timed out resolving the platform URL.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/stream-orchestrator/video-proxy/resolve': {
          post: {
            tags: ['Streaming'],
            summary: 'Resolve a platform URL to a direct media URL',
            description: 'Uses yt-dlp on the server to extract a direct, playable media URL from a YouTube, Twitch, Vimeo, or Dailymotion link. The resolved URL can be loaded in a browser <video> element or passed to video-push. Rate-limited to 5 requests per IP per 60 s. Requires yt-dlp installed on the server.',
            security: [{ BearerAuth: [] }],
            requestBody: {
              required: true,
              content: { 'application/json': { schema: { type: 'object', required: ['url'], properties: { url: { type: 'string', description: 'Platform URL to resolve.', example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } } } } },
            },
            responses: {
              200: { description: 'Resolved successfully.', content: { 'application/json': { schema: { type: 'object', required: ['resolvedUrl', 'title'], properties: { resolvedUrl: { type: 'string' }, title: { type: 'string' } } } } } },
              400: { description: 'url missing or not from a supported platform.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              422: { description: 'Video is unavailable or yt-dlp could not extract a URL.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              429: { description: 'Rate limit exceeded.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              503: { description: 'yt-dlp is not installed on this server.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              504: { description: 'yt-dlp timed out.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },

        // -----------------------------------------------------------------------
        // BILLING
        // -----------------------------------------------------------------------
        '/billing/plans': {
          get: {
            tags: ['Billing'],
            summary: 'List available plans',
            description: 'Returns all active subscription plans ordered by price.',
            responses: {
              200: { description: 'Plans list.', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, slug: { type: 'string' }, name: { type: 'string' }, priceCents: { type: 'integer' }, features: { type: 'array', items: { type: 'string' } }, maxSocialAccounts: { type: 'integer', nullable: true }, sortOrder: { type: 'integer' } } } } } } } } },
            },
          },
        },
        '/billing/entitlements': {
          get: {
            tags: ['Billing'],
            summary: 'Get current entitlements',
            description: 'Returns the active entitlement record for the authenticated user, including their subscription tier, available features, and account limits.',
            security: [{ BearerAuth: [] }],
            responses: {
              200: { description: 'Entitlements.', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Entitlement' } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/billing/subscriptions/current': {
          get: {
            tags: ['Billing'],
            summary: 'Get current subscription',
            description: 'Returns the active Stripe subscription for the authenticated user.',
            security: [{ BearerAuth: [] }],
            responses: {
              200: { description: 'Subscription.', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Subscription' } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              404: { description: 'No active subscription (free plan has no Stripe record).', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/billing/subscriptions/checkout': {
          post: {
            tags: ['Billing'],
            summary: 'Create Stripe Checkout session',
            description: 'Creates a Stripe Checkout session to upgrade to the Premium plan. Returns a redirect URL for the client to open.',
            security: [{ BearerAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['successUrl', 'cancelUrl'],
                    properties: {
                      successUrl: { type: 'string', format: 'uri', description: 'URL Stripe redirects to after successful payment.', example: 'https://app.tiklivepro.pro/billing/success' },
                      cancelUrl: { type: 'string', format: 'uri', description: 'URL Stripe redirects to if the user cancels.', example: 'https://app.tiklivepro.pro/billing' },
                    },
                  },
                },
              },
            },
            responses: {
              200: { description: 'Checkout URL.', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object', properties: { checkoutUrl: { type: 'string', format: 'uri' } } } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              409: { description: 'User already has a Premium subscription.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/billing/subscriptions/cancel': {
          post: {
            tags: ['Billing'],
            summary: 'Cancel subscription',
            description: 'Schedules the Stripe subscription for cancellation at the end of the current billing period. The user retains Premium access until then.',
            security: [{ BearerAuth: [] }],
            responses: {
              200: { description: 'Subscription scheduled for cancellation.', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Subscription' } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              404: { description: 'No active subscription to cancel.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/billing/webhooks/stripe': {
          post: {
            tags: ['Billing'],
            summary: 'Stripe webhook',
            description: 'Receives Stripe webhook events (payment succeeded, subscription updated, etc.). **Do not call this endpoint directly.** Validated using Stripe webhook signature verification.',
            responses: {
              200: { description: 'Event acknowledged.' },
              400: { description: 'Invalid Stripe signature.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },

        // -----------------------------------------------------------------------
        // COMMENTS
        // -----------------------------------------------------------------------
        '/comments': {
          get: {
            tags: ['Comments'],
            summary: 'List comments for a session',
            description: 'Returns a paginated list of comments aggregated from all streaming platforms for a specific live session.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'query', name: 'sessionId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Live session ID to fetch comments for.' },
              { in: 'query', name: 'platform', required: false, schema: { type: 'string', enum: ['tiktok', 'facebook'] }, description: 'Filter by platform.' },
              { in: 'query', name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 }, description: 'Page number (1-based).' },
              { in: 'query', name: 'pageSize', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 }, description: 'Number of results per page.' },
            ],
            responses: {
              200: {
                description: 'Paginated comment list.',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            items: { type: 'array', items: { $ref: '#/components/schemas/Comment' } },
                            total: { type: 'integer' },
                            page: { type: 'integer' },
                            pageSize: { type: 'integer' },
                            hasNextPage: { type: 'boolean' },
                          },
                        },
                      },
                    },
                  },
                },
              },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },

        // -----------------------------------------------------------------------
        // NOTIFICATIONS
        // -----------------------------------------------------------------------
        '/notifications': {
          get: {
            tags: ['Notifications'],
            summary: 'List notifications',
            description: 'Returns a paginated list of in-app notifications for the authenticated user, sorted by most recent first.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'query', name: 'unreadOnly', required: false, schema: { type: 'boolean', default: false }, description: 'When true, returns only unread notifications.' },
              { in: 'query', name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 }, description: 'Page number.' },
              { in: 'query', name: 'pageSize', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 }, description: 'Results per page.' },
            ],
            responses: {
              200: {
                description: 'Notification list.',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            items: { type: 'array', items: { $ref: '#/components/schemas/Notification' } },
                            total: { type: 'integer' },
                            unreadCount: { type: 'integer', description: 'Total unread notifications for the user.' },
                            page: { type: 'integer' },
                            pageSize: { type: 'integer' },
                            hasNextPage: { type: 'boolean' },
                          },
                        },
                      },
                    },
                  },
                },
              },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/notifications/{notificationId}/read': {
          patch: {
            tags: ['Notifications'],
            summary: 'Mark notification as read',
            description: 'Marks a single notification as read.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'path', name: 'notificationId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Notification ID.' },
            ],
            responses: {
              200: { description: 'Notification marked as read.', content: { 'application/json': { schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Notification' } } } } } },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              404: { description: 'Notification not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/notifications/read-all': {
          post: {
            tags: ['Notifications'],
            summary: 'Mark all notifications as read',
            description: 'Marks all unread notifications for the authenticated user as read.',
            security: [{ BearerAuth: [] }],
            responses: {
              204: { description: 'All notifications marked as read.' },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },

        // -----------------------------------------------------------------------
        // ANALYTICS
        // -----------------------------------------------------------------------
        '/analytics/overview': {
          get: {
            tags: ['Analytics'],
            summary: 'Get analytics overview',
            description: 'Returns aggregated performance metrics for all sessions of the authenticated user within a date range.',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'query', name: 'from', required: false, schema: { type: 'string', format: 'date', example: '2026-05-01' }, description: 'Start date (ISO 8601 date).' },
              { in: 'query', name: 'to', required: false, schema: { type: 'string', format: 'date', example: '2026-05-19' }, description: 'End date (ISO 8601 date).' },
            ],
            responses: {
              200: {
                description: 'Overview metrics.',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            totalSessions: { type: 'integer', example: 12 },
                            totalDurationSeconds: { type: 'integer', example: 86400 },
                            totalComments: { type: 'integer', example: 3452 },
                            platforms: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  platform: { type: 'string', enum: ['tiktok', 'facebook'] },
                                  sessions: { type: 'integer' },
                                  comments: { type: 'integer' },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },
        '/analytics/sessions/{sessionId}': {
          get: {
            tags: ['Analytics'],
            summary: 'Get session analytics',
            description: 'Returns detailed performance metrics for a specific session: stream health over time, comment velocity, viewer counts (if available from platform APIs).',
            security: [{ BearerAuth: [] }],
            parameters: [
              { in: 'path', name: 'sessionId', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Live session ID.' },
            ],
            responses: {
              200: {
                description: 'Session analytics.',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            sessionId: { type: 'string', format: 'uuid' },
                            durationSeconds: { type: 'integer', example: 3600 },
                            totalComments: { type: 'integer', example: 287 },
                            streamHealth: {
                              type: 'array',
                              description: 'Time-series stream health snapshots sampled every 30 s.',
                              items: {
                                type: 'object',
                                properties: {
                                  timestamp: { type: 'string', format: 'date-time' },
                                  bitrate: { type: 'integer', description: 'kbps', example: 3500 },
                                  fps: { type: 'number', example: 30.0 },
                                  droppedFrames: { type: 'integer', example: 2 },
                                },
                              },
                            },
                            platforms: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  platform: { type: 'string', enum: ['tiktok', 'facebook'] },
                                  comments: { type: 'integer' },
                                  streamStatus: { type: 'string', enum: ['live', 'ended', 'error'] },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              401: { description: 'Unauthorized.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              403: { description: 'Session belongs to another user.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
              404: { description: 'Session not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
            },
          },
        },

        // -----------------------------------------------------------------------
        // HEALTH
        // -----------------------------------------------------------------------
        '/health': {
          get: {
            tags: ['Health'],
            summary: 'Liveness probe',
            description: 'Returns `ok` immediately. Used by Kubernetes liveness checks.',
            responses: {
              200: { description: 'Gateway is alive.', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] }, service: { type: 'string', example: 'api-gateway' } } } } } },
            },
          },
        },
        '/ready': {
          get: {
            tags: ['Health'],
            summary: 'Readiness probe',
            description: 'Returns `ready` when the gateway is accepting traffic.',
            responses: {
              200: { description: 'Gateway ready.', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['ready'] } } } } } },
            },
          },
        },
      },
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
      tryItOutEnabled: true,
    },
    staticCSP: true,
  });

  // ---------------------------------------------------------------------------
  // Correlation ID hook
  // ---------------------------------------------------------------------------
  fastify.addHook('onRequest', async (request) => {
    if (!request.headers['x-correlation-id']) {
      request.headers['x-correlation-id'] = randomUUID();
    }
  });

  // ---------------------------------------------------------------------------
  // Proxy routes
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Streaming passthrough — merge-stream (binary MP4, not JSON)
  // ---------------------------------------------------------------------------
  // The generic proxy below buffers via response.json() which cannot handle
  // streaming binary responses. This dedicated route pipes the ffmpeg output
  // directly to the client without buffering.
  fastify.get('/stream-orchestrator/video-proxy/merge-stream', async (request, reply) => {
    const upstreamPath = request.url.slice('/stream-orchestrator'.length);
    const targetUrl = `${env.STREAM_ORCHESTRATOR_SERVICE_URL}${upstreamPath}`;

    let upstream: Response;
    try {
      upstream = await fetch(targetUrl);
    } catch {
      return reply.status(502).send({ error: { code: 'BAD_GATEWAY', message: 'Upstream unavailable' } });
    }

    if (!upstream.body) {
      return reply.status(upstream.status).send();
    }

    // Bypass Fastify's JSON serialization pipeline — pipe the binary MP4 stream
    // directly to the raw Node.js response socket so no buffering or encoding occurs.
    reply.hijack();
    reply.raw.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') ?? 'video/mp4',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      'Cross-Origin-Resource-Policy': env.NODE_ENV === 'development' ? 'cross-origin' : 'same-origin',
    });

    const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
    // Destroy the upstream when the browser disconnects so ffmpeg is killed promptly.
    request.raw.once('close', () => { nodeStream.destroy(); });
    nodeStream.pipe(reply.raw, { end: true });
  });

  // ---------------------------------------------------------------------------
  // Hop-by-hop headers must not be forwarded to downstream services.
  // accept-encoding is excluded so the downstream always returns uncompressed
  // JSON — the gateway re-serializes the body so it cannot forward a
  // compressed response verbatim.
  const HOP_BY_HOP = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailers', 'transfer-encoding', 'upgrade', 'accept-encoding',
    'content-length', // recalculated by fetch from the re-serialized body
  ]);

  for (const [prefix, upstream] of Object.entries(SERVICE_ROUTES)) {
    const isPublic = PUBLIC_PREFIXES.has(prefix);

    const handler = async (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
      const requestPath = request.url.split('?')[0]!;
      const isPublicGet = request.method === 'GET' && PUBLIC_GET_PATHS.has(requestPath);
      if (!isPublic && !isPublicGet && !PUBLIC_PATHS.has(requestPath) && !PUBLIC_PATH_PATTERNS.some((p) => p.test(requestPath))) {
        await request.jwtVerify();
      }

      const upstreamPath = STRIP_PREFIX_ROUTES.has(prefix)
        ? request.url.slice(prefix.length) || '/'
        : request.url;
      const targetUrl = `${upstream}${upstreamPath}`;
      const forwardedHeaders = Object.fromEntries(
        Object.entries(request.headers).filter(
          ([k, v]) => v !== undefined && !HOP_BY_HOP.has(k.toLowerCase()),
        ) as [string, string][],
      );

      const fetchOptions: RequestInit = {
        method: request.method,
        headers: {
          ...forwardedHeaders,
          'x-correlation-id': request.headers['x-correlation-id'] as string,
        },
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        fetchOptions.body = JSON.stringify(request.body);
      }

      try {
        const response = await fetch(targetUrl, fetchOptions);
        if (response.status === 204 || response.headers.get('content-length') === '0') {
          return reply.status(response.status).send();
        }
        const data = await response.json();
        return reply.status(response.status).send(data);
      } catch (err) {
        logger.error({ err, targetUrl, method: request.method }, 'Proxy fetch failed');
        return reply.status(502).send({ error: { code: 'BAD_GATEWAY', message: 'Upstream service unavailable' } });
      }
    };

    // Register both the exact prefix (e.g. POST /sessions) and sub-paths (e.g. GET /sessions/:id)
    fastify.all(prefix, handler);
    fastify.all(`${prefix}/*`, handler);
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------
  fastify.get('/health', async () => ({ status: 'ok', service: 'api-gateway' }));
  fastify.get('/ready', async () => ({ status: 'ready' }));

  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info({ port: env.PORT }, 'API Gateway listening — docs at /docs');
}

bootstrap().catch((err: unknown) => {
  logger.error(err, 'Failed to start API Gateway');
  process.exit(1);
});
