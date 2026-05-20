import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RegisterUseCase } from '../../application/use-cases/register.use-case.js';
import type { LoginUseCase } from '../../application/use-cases/login.use-case.js';
import type { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case.js';
import type { OAuthSocialLoginUseCase } from '../../application/use-cases/oauth-social-login.use-case.js';
import { DomainError, UnauthorizedError } from '@tik-live-pro/domain';
import { emailSchema, passwordSchema, displayNameSchema } from '@tik-live-pro/validation';

const oauthSocialSchema = z.object({
  provider: z.enum(['google', 'facebook', 'tiktok']),
  accessToken: z.string().min(1),
});

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  locale: z.string().optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Reusable inline schema fragments
// ---------------------------------------------------------------------------

const tokenPairProperties = {
  userId: {
    type: 'string',
    format: 'uuid',
    description: 'Unique identifier of the authenticated user.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  },
  accessToken: {
    type: 'string',
    description:
      'Short-lived JWT (default TTL: 15 min). Send as `Authorization: Bearer <token>` on every subsequent request.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyJ9.abc',
  },
  refreshToken: {
    type: 'string',
    description:
      'Long-lived opaque token (default TTL: 30 days). Send to POST /auth/refresh to obtain a new pair.',
    example: 'dGhpc2lzYXJlZnJlc2h0b2tlbg==',
  },
  accessTokenExpiresAt: {
    type: 'string',
    format: 'date-time',
    description: 'ISO 8601 expiry timestamp of the access token.',
    example: '2026-05-19T10:15:00.000Z',
  },
  refreshTokenExpiresAt: {
    type: 'string',
    format: 'date-time',
    description: 'ISO 8601 expiry timestamp of the refresh token.',
    example: '2026-06-18T10:00:00.000Z',
  },
} as const;

const tokenPairResponse = (statusDescription: string) => ({
  description: statusDescription,
  type: 'object',
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      required: ['userId', 'accessToken', 'refreshToken'],
      properties: tokenPairProperties,
    },
  },
});

const errorResponse = (description: string) => ({
  description,
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: {
          type: 'string',
          description: 'Machine-readable error code.',
          example: 'EMAIL_TAKEN',
        },
        message: {
          type: 'string',
          description: 'Human-readable error message.',
          example: 'Email already registered',
        },
      },
    },
  },
});

// ---------------------------------------------------------------------------

export function registerAuthRoutes(
  fastify: FastifyInstance,
  deps: {
    registerUseCase: RegisterUseCase;
    loginUseCase: LoginUseCase;
    refreshTokenUseCase: RefreshTokenUseCase;
    oauthSocialLoginUseCase: OAuthSocialLoginUseCase;
  },
): void {
  const { registerUseCase, loginUseCase, refreshTokenUseCase, oauthSocialLoginUseCase } = deps;

  // POST /auth/register -------------------------------------------------------
  fastify.post(
    '/auth/register',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Register a new user',
        description: `
Creates a new user account and immediately returns a JWT access/refresh token pair.

**Constraints**
- Email addresses must be unique across the platform.
- Passwords are validated by the \`@tik-live-pro/validation\` policy (min 8 chars, complexity rules).
- Display names must be 2–50 characters.

**Side effects**
- A \`auth.user.registered\` event is published to NATS JetStream.
- The \`users\` service consumes this event and creates the matching user profile.
- The \`billing\` service seeds a FREE-tier entitlement record.

> **No authorization required.** This endpoint is public.
        `.trim(),
        body: {
          type: 'object',
          required: ['email', 'password', 'displayName'],
          additionalProperties: false,
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'Email address. Must be unique on the platform.',
              example: 'alice@example.com',
            },
            password: {
              type: 'string',
              minLength: 8,
              description:
                'Plain-text password. Stored as a bcrypt hash (rounds=12). Minimum 8 characters with complexity requirements.',
              example: 'Sup3rS3cret!',
            },
            displayName: {
              type: 'string',
              minLength: 2,
              maxLength: 50,
              description: 'Publicly visible name shown on streams and leaderboards.',
              example: 'Alice Streamer',
            },
            locale: {
              type: 'string',
              description:
                'Preferred UI locale as a BCP 47 language tag. Defaults to `en` if omitted.',
              default: 'en',
              example: 'fr',
            },
          },
        },
        response: {
          201: tokenPairResponse('Registration successful. Token pair issued.'),
          409: errorResponse('Email address is already registered by another account.'),
          422: errorResponse('Validation error — request body failed schema checks.'),
        },
      },
    },
    async (request, reply) => {
      const body = registerSchema.parse(request.body);
      const correlationId =
        (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();

      try {
        const result = await registerUseCase.execute(body, correlationId);
        return reply.status(201).send({ data: result });
      } catch (err) {
        if (err instanceof DomainError) {
          return reply.status(409).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );

  // POST /auth/login ----------------------------------------------------------
  fastify.post(
    '/auth/login',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Log in',
        description: `
Authenticates a registered user with email + password and returns a fresh JWT access/refresh token pair.

**Security notes**
- The response is identical whether the email is unregistered or the password is wrong — this prevents user-enumeration attacks.
- The caller's IP address and User-Agent are recorded in the \`auth.user.logged_in\` NATS event for audit logs.

> **No authorization required.** This endpoint is public.
        `.trim(),
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'Registered email address.',
              example: 'alice@example.com',
            },
            password: {
              type: 'string',
              description: 'Account password.',
              example: 'Sup3rS3cret!',
            },
          },
        },
        response: {
          200: tokenPairResponse('Login successful. Token pair issued.'),
          401: errorResponse('Invalid credentials — wrong email or password.'),
          422: errorResponse('Validation error — request body failed schema checks.'),
        },
      },
    },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const correlationId =
        (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();

      try {
        const result = await loginUseCase.execute(
          {
            ...body,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] ?? '',
          },
          correlationId,
        );
        return reply.send({ data: result });
      } catch (err) {
        if (err instanceof DomainError) {
          return reply.status(401).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );

  // POST /auth/oauth/social ---------------------------------------------------
  fastify.post(
    '/auth/oauth/social',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Social OAuth login (Google / Facebook / TikTok)',
        description: `
Exchanges a provider OAuth access token for a TikLivePro JWT token pair.

**Client flow**
1. Complete the OAuth flow with the provider (web: NextAuth, mobile: react-native-app-auth).
2. Send the provider's access token to this endpoint.
3. The service verifies the token with the provider's API, creates or finds the user, and returns a JWT pair.

**Account linking:** if the OAuth email matches an existing email/password account, the OAuth identity is automatically linked to that account.

> **No authorization required.** This endpoint is public.
        `.trim(),
        body: {
          type: 'object',
          required: ['provider', 'accessToken'],
          additionalProperties: false,
          properties: {
            provider: {
              type: 'string',
              enum: ['google', 'facebook', 'tiktok'],
              description: 'OAuth provider identifier.',
              example: 'google',
            },
            accessToken: {
              type: 'string',
              description: "The access token issued by the provider's OAuth flow.",
              example: 'ya29.a0AfH6...',
            },
          },
        },
        response: {
          200: {
            description: 'OAuth login successful. Token pair issued.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['userId', 'accessToken', 'refreshToken', 'subscriptionTier'],
                properties: {
                  ...tokenPairProperties,
                  subscriptionTier: {
                    type: 'string',
                    description: 'User subscription tier.',
                    example: 'free',
                  },
                },
              },
            },
          },
          401: errorResponse('Provider token is invalid or expired.'),
          422: errorResponse('Validation error — request body failed schema checks.'),
        },
      },
    },
    async (request, reply) => {
      const body = oauthSocialSchema.parse(request.body);
      const correlationId =
        (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();
      try {
        const result = await oauthSocialLoginUseCase.execute(body, correlationId);
        return reply.send({ data: result });
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          return reply.status(401).send({ error: { code: err.code, message: err.message } });
        }
        if (err instanceof DomainError) {
          return reply.status(401).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );

  // POST /auth/refresh --------------------------------------------------------
  fastify.post(
    '/auth/refresh',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Refresh access token',
        description: `
Exchanges a valid refresh token for a **new** access/refresh token pair.

**Token rotation:** the submitted refresh token is permanently invalidated on success.
Always store and use the newly issued tokens — replaying an old refresh token will return HTTP 401.

**Typical client flow:**
1. Make an API call → receive HTTP 401 (access token expired).
2. Call \`POST /auth/refresh\` with the stored refresh token.
3. Store the new token pair and retry the original request.
4. If this endpoint also returns 401, direct the user to log in again.

> **No authorization required.** This endpoint is public.
        `.trim(),
        body: {
          type: 'object',
          required: ['refreshToken'],
          additionalProperties: false,
          properties: {
            refreshToken: {
              type: 'string',
              minLength: 1,
              description:
                'The refresh token previously issued by POST /auth/login or POST /auth/register.',
              example: 'dGhpc2lzYXJlZnJlc2h0b2tlbg==',
            },
          },
        },
        response: {
          200: tokenPairResponse('Token rotated successfully. New pair issued.'),
          401: errorResponse(
            'Refresh token is invalid, expired, or has already been rotated.',
          ),
          404: errorResponse('The user associated with this token no longer exists.'),
          422: errorResponse('Validation error — request body failed schema checks.'),
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = refreshSchema.parse(request.body);

      try {
        const result = await refreshTokenUseCase.execute(refreshToken);
        return reply.send({ data: result });
      } catch (err) {
        if (err instanceof DomainError) {
          return reply.status(401).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );
}
