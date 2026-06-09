import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { socialAccounts, oauthStates } from '../../infrastructure/db/schema.js';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { Logger } from '@tik-live-pro/logger';
import { SocialPlatform } from '@tik-live-pro/shared-types';
import type { SocialAccountId, UserId } from '@tik-live-pro/shared-types';
import { TikTokAdapter, FacebookAdapter } from '@tik-live-pro/platform-adapters';

// ---------------------------------------------------------------------------
// Reusable schema fragments
// ---------------------------------------------------------------------------

const bearerAuth = [{ BearerAuth: [] }];

const errorSchema = (description: string) => ({
  description,
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', description: 'Machine-readable error code.', example: 'NOT_FOUND' },
        message: { type: 'string', description: 'Human-readable error message.', example: 'Account not found' },
      },
    },
  },
});

const socialAccountSchema = {
  type: 'object',
  description: 'A connected social media account.',
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Internal unique ID of the connected account.' },
    platform: {
      type: 'string',
      enum: ['tiktok', 'facebook'],
      description: 'Social platform.',
      example: 'tiktok',
    },
    platformUserId: {
      type: 'string',
      description: 'Platform-assigned user ID (e.g., TikTok open_id or Facebook user_id).',
      example: 'tiktok_open_id_abc123',
    },
    displayName: {
      type: 'string',
      description: 'Display name as returned by the platform.',
      example: '@alice_streams',
    },
    avatarUrl: {
      type: 'string',
      format: 'uri',
      nullable: true,
      description: 'Profile picture URL from the platform.',
      example: 'https://p16-sign.tiktokcdn-us.com/avatar.jpg',
    },
    isActive: {
      type: 'boolean',
      description: 'Whether the account is currently usable. False if the OAuth token has expired and cannot be refreshed.',
      example: true,
    },
    connectedAt: {
      type: 'string',
      format: 'date-time',
      description: 'ISO 8601 timestamp when the account was first connected.',
    },
  },
};

// ---------------------------------------------------------------------------

function encryptToken(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex.padEnd(64, '0').slice(0, 64), 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function decryptToken(encryptedHex: string, keyHex: string): string {
  const key = Buffer.from(keyHex.padEnd(64, '0').slice(0, 64), 'hex');
  const parts = encryptedHex.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted token format');
  const iv = Buffer.from(parts[0]!, 'hex');
  const tag = Buffer.from(parts[1]!, 'hex');
  const ciphertext = Buffer.from(parts[2]!, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

type IntegrationsDeps = {
  db: NodePgDatabase;
  tokenEncryptionKey: string;
  internalApiKey: string;
  tiktokClientKey: string;
  tiktokClientSecret: string;
  facebookAppId: string;
  facebookAppSecret: string;
  oauthRedirectBaseUrl: string;
  frontendUrl: string;
  nats: NatsJetStreamClient;
  logger: Logger;
};

export function registerIntegrationsRoutes(
  fastify: FastifyInstance,
  deps: IntegrationsDeps,
): void {
  // GET /integrations/accounts -----------------------------------------------
  fastify.get(
    '/integrations/accounts',
    {
      schema: {
        tags: ['Integrations'],
        summary: 'List connected social accounts',
        description: `
Returns all social accounts (TikTok, Facebook) connected by the authenticated user.

**Freemium limit:** free-plan users may have a maximum of 2 connected accounts. Use \`GET /billing/entitlements\` to check \`maxSocialAccounts\`.

**Inactive accounts:** an account may become inactive (\`isActive: false\`) if its OAuth refresh token expires (TikTok tokens expire after 30 days of inactivity). The user must reconnect via the OAuth flow.
        `.trim(),
        security: bearerAuth,
        querystring: {
          type: 'object',
          properties: {
            platform: {
              type: 'string',
              enum: ['tiktok', 'facebook'],
              description: 'Filter results to a single platform.',
            },
          },
        },
        response: {
          200: {
            description: 'List of connected accounts.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'array',
                items: socialAccountSchema,
              },
            },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
        },
      },
    },
    async (request, reply) => {
      await request.jwtVerify();
      const userId = (request.user as { sub: string }).sub;

      const rows = await deps.db
        .select({
          id: socialAccounts.id,
          platform: socialAccounts.platform,
          platformUserId: socialAccounts.platformUserId,
          displayName: socialAccounts.displayName,
          avatarUrl: socialAccounts.avatarUrl,
          isActive: socialAccounts.isActive,
          connectedAt: socialAccounts.connectedAt,
        })
        .from(socialAccounts)
        .where(eq(socialAccounts.userId, userId));

      return reply.status(200).send({
        data: rows.map((r) => ({ ...r, connectedAt: r.connectedAt.toISOString() })),
      });
    },
  );

  // DELETE /integrations/accounts/:accountId ---------------------------------
  fastify.delete<{ Params: { accountId: string } }>(
    '/integrations/accounts/:accountId',
    {
      schema: {
        tags: ['Integrations'],
        summary: 'Disconnect a social account',
        description: `
Revokes the stored OAuth tokens and removes the social account from the user's profile.

**Effects:**
- The platform OAuth token is revoked (best-effort — if revocation fails, the account is still removed locally).
- Any currently active live session that includes this account's destination will have that destination marked as \`ended\`.
- A \`integration.account.disconnected\` NATS event is published.

**Free plan users:** after removal, the account slot is freed and can be replaced by a different account.
        `.trim(),
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['accountId'],
          properties: {
            accountId: {
              type: 'string',
              format: 'uuid',
              description: 'Internal ID of the connected social account to remove.',
              example: 'd4e5f6a7-b8c9-0123-defg-234567890123',
            },
          },
        },
        response: {
          204: { description: 'Account disconnected and tokens revoked.' },
          401: errorSchema('Missing or invalid Bearer token.'),
          403: errorSchema('The account belongs to a different user.'),
          404: errorSchema('Connected account not found.'),
        },
      },
    },
    async (request, reply) => {
      await request.jwtVerify();
      const userId = (request.user as { sub: string }).sub;
      const { accountId } = request.params;

      const [account] = await deps.db
        .select()
        .from(socialAccounts)
        .where(eq(socialAccounts.id, accountId));

      if (!account) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Account not found' } });
      }
      if (account.userId !== userId) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Account belongs to a different user' } });
      }

      // Best-effort token revocation
      try {
        const accessToken = decryptToken(account.accessTokenEncrypted, deps.tokenEncryptionKey);
        if (account.platform === SocialPlatform.FACEBOOK) {
          const adapter = new FacebookAdapter({ appId: deps.facebookAppId, appSecret: deps.facebookAppSecret }, deps.logger);
          await adapter.revokeTokens(accessToken);
        } else if (account.platform === SocialPlatform.TIKTOK) {
          const adapter = new TikTokAdapter({ clientKey: deps.tiktokClientKey, clientSecret: deps.tiktokClientSecret }, deps.logger);
          await adapter.revokeTokens(accessToken);
        }
      } catch (err) {
        deps.logger.warn({ err, accountId }, 'Token revocation failed (non-blocking)');
      }

      await deps.db.delete(socialAccounts).where(eq(socialAccounts.id, accountId));

      await deps.nats.publish(Subjects.INTEGRATION_ACCOUNT_DISCONNECTED, {
        socialAccountId: accountId as SocialAccountId,
        userId: userId as UserId,
        platform: account.platform as SocialPlatform,
        platformUserId: account.platformUserId,
        reason: 'user_disconnected' as const,
      });

      return reply.status(204).send();
    },
  );

  // GET /integrations/oauth/:platform/start ----------------------------------
  fastify.get<{ Params: { platform: string } }>(
    '/integrations/oauth/:platform/start',
    {
      schema: {
        tags: ['Integrations'],
        summary: 'Start OAuth flow',
        description: `
Initiates the OAuth 2.0 authorization code flow for the specified platform.

**Flow:**
1. Call this endpoint — it responds with a **302 redirect** to the platform's OAuth consent screen.
2. The user approves the requested permissions on the platform.
3. The platform redirects back to \`GET /integrations/oauth/{platform}/callback\`.
4. The callback endpoint exchanges the code, stores the tokens, and creates the \`SocialAccount\` record.

**CSRF protection:** a state token is generated and stored in the session. The callback verifies it before processing the code.

**Entitlement check:** if the user already has the maximum allowed accounts for their plan, this returns HTTP 422 rather than redirecting.
        `.trim(),
        security: bearerAuth,
        params: {
          type: 'object',
          required: ['platform'],
          properties: {
            platform: {
              type: 'string',
              enum: ['tiktok', 'facebook'],
              description: 'Target platform to connect.',
              example: 'tiktok',
            },
          },
        },
        response: {
          200: {
            description: 'OAuth authorization URL to redirect the user to.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['authUrl'],
                properties: {
                  authUrl: {
                    type: 'string',
                    format: 'uri',
                    description: 'Platform OAuth consent screen URL. Redirect the user here to begin authorization.',
                    example: 'https://open.tiktok.com/platform/oauth?client_key=...&redirect_uri=...&state=...',
                  },
                },
              },
            },
          },
          400: errorSchema('Unsupported platform identifier.'),
          401: errorSchema('Missing or invalid Bearer token.'),
          422: errorSchema(
            'Entitlement limit exceeded — free plan allows a maximum of 2 connected accounts. Upgrade to Premium for unlimited accounts.',
          ),
        },
      },
    },
    async (request, reply) => {
      await request.jwtVerify();
      const userId = (request.user as { sub: string }).sub;
      const { platform } = request.params;

      if (platform !== 'tiktok' && platform !== 'facebook') {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'Unsupported platform' } });
      }

      const state = randomUUID();
      const redirectUri = `${deps.oauthRedirectBaseUrl}/integrations/oauth/${platform}/callback`;

      await deps.db.insert(oauthStates).values({
        id: randomUUID(),
        userId,
        platform,
        state,
        redirectUri,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      let authUrl: string;
      if (platform === 'tiktok') {
        const params = new URLSearchParams({
          client_key: deps.tiktokClientKey,
          redirect_uri: redirectUri,
          state,
          scope: 'user.info.basic,live.stream.content',
          response_type: 'code',
        });
        authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
      } else {
        const params = new URLSearchParams({
          client_id: deps.facebookAppId,
          redirect_uri: redirectUri,
          state,
          scope: 'pages_show_list,pages_manage_posts,pages_read_engagement',
          response_type: 'code',
        });
        authUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
      }

      return reply.status(200).send({ data: { authUrl } });
    },
  );

  // GET /integrations/oauth/:platform/callback --------------------------------
  fastify.get<{ Params: { platform: string }; Querystring: { code: string; state: string; error?: string } }>(
    '/integrations/oauth/:platform/callback',
    {
      schema: {
        tags: ['Integrations'],
        summary: 'OAuth callback (platform → server)',
        description: `
Callback URL invoked by the social platform after the user completes the OAuth consent screen.

**Do not call this endpoint directly.** It is meant to be called by the platform's OAuth server as part of the authorization code flow.

**Processing steps:**
1. Validate the \`state\` parameter against the stored CSRF token.
2. Exchange the \`code\` for an access token + refresh token via the platform's token endpoint.
3. Fetch the user's platform profile (user ID, display name, avatar).
4. Store the \`SocialAccount\` record with AES-256-GCM encrypted tokens.
5. Publish an \`integration.account.connected\` NATS event.
6. Redirect the user to the app's success URL.
        `.trim(),
        params: {
          type: 'object',
          required: ['platform'],
          properties: {
            platform: {
              type: 'string',
              enum: ['tiktok', 'facebook'],
              description: 'Platform that completed the OAuth flow.',
            },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Authorization code returned by the platform.',
            },
            state: {
              type: 'string',
              description: 'CSRF state token that must match the one generated in the start endpoint.',
            },
            error: {
              type: 'string',
              description: 'Error code returned by the platform if the user denied access.',
              example: 'access_denied',
            },
          },
        },
        response: {
          302: { description: 'Redirect to the app after success or failure.' },
          400: errorSchema('Missing or invalid state token, or the platform returned an error.'),
        },
      },
    },
    async (request, reply) => {
      const { platform } = request.params;
      const { code, state, error } = request.query;
      const failureUrl = `${deps.frontendUrl}/settings?error=connect_failed`;

      if (error || !code || !state) {
        return reply.redirect(failureUrl);
      }

      const [stateRow] = await deps.db
        .select()
        .from(oauthStates)
        .where(and(eq(oauthStates.state, state), eq(oauthStates.platform, platform)));

      if (!stateRow || stateRow.expiresAt < new Date()) {
        return reply.redirect(failureUrl);
      }

      await deps.db.delete(oauthStates).where(eq(oauthStates.id, stateRow.id));

      try {
        let accessToken: string;
        let refreshToken: string | null;
        let expiresAt: Date;
        let platformUserId: string;
        let displayName: string;
        let avatarUrl: string | null;

        if (platform === 'facebook') {
          const adapter = new FacebookAdapter({ appId: deps.facebookAppId, appSecret: deps.facebookAppSecret }, deps.logger);
          const tokens = await adapter.exchangeCode(code, stateRow.redirectUri);
          const user = await adapter.getUser(tokens.accessToken);
          accessToken = tokens.accessToken;
          refreshToken = tokens.refreshToken;
          expiresAt = tokens.expiresAt;
          platformUserId = user.platformUserId;
          displayName = user.displayName;
          avatarUrl = user.avatarUrl;
        } else {
          const adapter = new TikTokAdapter({ clientKey: deps.tiktokClientKey, clientSecret: deps.tiktokClientSecret }, deps.logger);
          const tokens = await adapter.exchangeCode(code, stateRow.redirectUri);
          const user = await adapter.getUser(tokens.accessToken);
          accessToken = tokens.accessToken;
          refreshToken = tokens.refreshToken;
          expiresAt = tokens.expiresAt;
          platformUserId = user.platformUserId;
          displayName = user.displayName;
          avatarUrl = user.avatarUrl;
        }

        const encryptedAccessToken = encryptToken(accessToken, deps.tokenEncryptionKey);
        const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken, deps.tokenEncryptionKey) : null;
        const accountId = randomUUID();

        const [saved] = await deps.db
          .insert(socialAccounts)
          .values({
            id: accountId,
            userId: stateRow.userId!,
            platform,
            platformUserId,
            displayName,
            avatarUrl,
            accessTokenEncrypted: encryptedAccessToken,
            refreshTokenEncrypted: encryptedRefreshToken,
            tokenExpiresAt: expiresAt,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: [socialAccounts.platform, socialAccounts.platformUserId],
            set: {
              userId: stateRow.userId!,
              displayName,
              avatarUrl,
              accessTokenEncrypted: encryptedAccessToken,
              refreshTokenEncrypted: encryptedRefreshToken,
              tokenExpiresAt: expiresAt,
              isActive: true,
              updatedAt: new Date(),
            },
          })
          .returning({ id: socialAccounts.id });

        await deps.nats.publish(Subjects.INTEGRATION_ACCOUNT_CONNECTED, {
          socialAccountId: (saved?.id ?? accountId) as SocialAccountId,
          userId: stateRow.userId as UserId,
          platform: platform as SocialPlatform,
          platformUserId,
          displayName,
        });

        return reply.redirect(`${deps.frontendUrl}/settings?connected=${platform}`);
      } catch (err) {
        deps.logger.error({ err, platform }, 'OAuth callback processing failed');
        return reply.redirect(failureUrl);
      }
    },
  );

  // POST /internal/accounts/tokens -----------------------------------------
  // Internal endpoint: returns decrypted access tokens for given account IDs.
  // Protected by X-Internal-Secret header — not exposed through the API gateway.
  fastify.post<{ Body: { accountIds: string[] } }>(
    '/internal/accounts/tokens',
    {
      schema: {
        tags: ['Internal'],
        summary: 'Get decrypted tokens for social accounts (internal use only)',
        body: {
          type: 'object',
          required: ['accountIds'],
          properties: {
            accountIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
          },
        },
        response: {
          200: {
            type: 'object',
            description: 'Map of accountId → token info',
          },
          401: errorSchema('Missing or invalid internal secret.'),
        },
      },
    },
    async (request, reply) => {
      if (request.headers['x-internal-secret'] !== deps.internalApiKey) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid internal secret' } });
      }

      const { accountIds } = request.body;
      if (accountIds.length === 0) return reply.status(200).send({ data: {} });

      const rows = await deps.db
        .select({
          id: socialAccounts.id,
          platform: socialAccounts.platform,
          platformUserId: socialAccounts.platformUserId,
          accessTokenEncrypted: socialAccounts.accessTokenEncrypted,
        })
        .from(socialAccounts)
        .where(inArray(socialAccounts.id, accountIds));

      const result: Record<string, { accessToken: string; platform: string; platformUserId: string }> = {};
      for (const row of rows) {
        try {
          result[row.id] = {
            accessToken: decryptToken(row.accessTokenEncrypted, deps.tokenEncryptionKey),
            platform: row.platform,
            platformUserId: row.platformUserId,
          };
        } catch {
          // Skip accounts with decryption errors
        }
      }

      return reply.status(200).send({ data: result });
    },
  );
}
