import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { socialAccounts } from '../../infrastructure/db/schema.js';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { Logger } from '@tik-live-pro/logger';
import { SocialPlatform } from '@tik-live-pro/shared-types';
import type { SocialAccountId, UserId } from '@tik-live-pro/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WebhookDeps = {
  db: NodePgDatabase;
  nats: NatsJetStreamClient;
  tiktokClientSecret: string;
  logger: Logger;
};

interface TikTokWebhookEvent {
  event: string;
  creator_id: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifyTikTokSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const received = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(received, 'hex');
    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleAuthorizationRevoke(creatorId: string, deps: WebhookDeps): Promise<void> {
  const rows = await deps.db
    .update(socialAccounts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(socialAccounts.platform, SocialPlatform.TIKTOK),
        eq(socialAccounts.platformUserId, creatorId),
      ),
    )
    .returning({
      id: socialAccounts.id,
      userId: socialAccounts.userId,
      platformUserId: socialAccounts.platformUserId,
    });

  if (rows.length === 0) {
    deps.logger.info({ creatorId }, 'TikTok webhook: authorization revoked for unknown account (already disconnected)');
    return;
  }

  const account = rows[0]!;
  deps.logger.info({ socialAccountId: account.id, creatorId }, 'TikTok webhook: account marked inactive after authorization revoke');

  await deps.nats.publish(Subjects.INTEGRATION_ACCOUNT_DISCONNECTED, {
    socialAccountId: account.id as SocialAccountId,
    userId: account.userId as UserId,
    platform: SocialPlatform.TIKTOK,
    platformUserId: account.platformUserId,
    reason: 'platform_revoked' as const,
  });
}

async function handleLiveSessionEnded(creatorId: string, deps: WebhookDeps): Promise<void> {
  const rows = await deps.db
    .select({ id: socialAccounts.id, platformUserId: socialAccounts.platformUserId })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.platform, SocialPlatform.TIKTOK),
        eq(socialAccounts.platformUserId, creatorId),
        eq(socialAccounts.isActive, true),
      ),
    );

  if (rows.length === 0) {
    deps.logger.info({ creatorId }, 'TikTok webhook: live.session.ended for unknown or inactive account');
    return;
  }

  const account = rows[0]!;
  deps.logger.info({ socialAccountId: account.id, creatorId }, 'TikTok webhook: platform force-ended live session');

  await deps.nats.publish(Subjects.INTEGRATION_PLATFORM_SESSION_ENDED, {
    platform: SocialPlatform.TIKTOK,
    platformUserId: account.platformUserId,
    socialAccountId: account.id as SocialAccountId,
  });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

const errorSchema = (description: string) => ({
  description,
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
});

export function registerTikTokWebhookRoutes(fastify: FastifyInstance, deps: WebhookDeps): void {
  // Scope the raw-body parser to webhook routes only so the global JSON parser is unaffected.
  void fastify.register(async (scope: FastifyInstance) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body as Buffer);
    });

    // GET /integrations/webhooks/tiktok — challenge verification
    // TikTok performs a one-time GET with ?challenge=<token> when the Callback URL is saved
    // in the developer portal. We must echo the value back to pass verification.
    scope.get<{ Querystring: { challenge?: string } }>(
      '/integrations/webhooks/tiktok',
      {
        schema: {
          tags: ['Webhooks'],
          summary: 'TikTok webhook challenge verification',
          description: `
One-time verification endpoint called by TikTok when the Callback URL is registered in the developer portal.

**Do not call this endpoint directly.** TikTok sends a \`GET\` request with \`?challenge=<token>\` and expects the same token echoed in the JSON response body.
          `.trim(),
          querystring: {
            type: 'object',
            properties: {
              challenge: {
                type: 'string',
                description: 'Opaque token sent by TikTok. Must be echoed back in the response body.',
              },
            },
          },
          response: {
            200: {
              description: 'Challenge echoed back to TikTok.',
              type: 'object',
              required: ['challenge'],
              properties: { challenge: { type: 'string' } },
            },
          },
        },
      },
      async (request, reply) => {
        const { challenge = '' } = request.query;
        deps.logger.debug({ challenge }, 'TikTok webhook: challenge verification');
        return reply.status(200).send({ challenge });
      },
    );

    // POST /integrations/webhooks/tiktok — event receiver
    scope.post(
      '/integrations/webhooks/tiktok',
      {
        schema: {
          tags: ['Webhooks'],
          summary: 'TikTok webhook event receiver',
          description: `
Receives push events from TikTok for the registered Callback URL.

**Do not call this endpoint directly.** All incoming requests are validated using **HMAC-SHA256** signature verification (\`X-TikTok-Signature: sha256=<hex>\`) against the \`TIKTOK_CLIENT_SECRET\`.

### Handled events

| Event | Action |
|---|---|
| \`user.authorization.revoke\` | Marks the social account as inactive (\`isActive: false\`) and publishes \`integration.account.disconnected\` |
| \`live.session.ended\` | Publishes \`integration.platform.session_ended\` so the \`live-session\` service can terminate the affected session |

Unknown event types are acknowledged with \`200 OK\` and logged.
          `.trim(),
          response: {
            200: {
              description: 'Event acknowledged.',
              type: 'object',
              required: ['ok'],
              properties: { ok: { type: 'boolean', example: true } },
            },
            400: errorSchema('HMAC signature verification failed or malformed JSON body.'),
          },
        },
      },
      async (request, reply) => {
        const rawBody = request.body as Buffer;
        const signature = request.headers['x-tiktok-signature'] as string | undefined;

        if (!verifyTikTokSignature(rawBody, signature, deps.tiktokClientSecret)) {
          deps.logger.warn({ ip: request.ip }, 'TikTok webhook: invalid signature — request rejected');
          return reply.status(400).send({
            error: { code: 'INVALID_SIGNATURE', message: 'Signature verification failed' },
          });
        }

        let event: TikTokWebhookEvent;
        try {
          event = JSON.parse(rawBody.toString('utf8')) as TikTokWebhookEvent;
        } catch {
          return reply.status(400).send({
            error: { code: 'INVALID_BODY', message: 'Request body is not valid JSON' },
          });
        }

        deps.logger.info({ event: event.event, creatorId: event.creator_id }, 'TikTok webhook: event received');

        switch (event.event) {
          case 'user.authorization.revoke':
            await handleAuthorizationRevoke(event.creator_id, deps);
            break;
          case 'live.session.ended':
            await handleLiveSessionEnded(event.creator_id, deps);
            break;
          default:
            deps.logger.debug({ event: event.event }, 'TikTok webhook: unhandled event type, acknowledged');
        }

        return reply.status(200).send({ ok: true });
      },
    );
  });
}
