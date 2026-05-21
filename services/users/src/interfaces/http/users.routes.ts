import type { FastifyInstance } from 'fastify';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

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
        message: { type: 'string', description: 'Human-readable error message.', example: 'User not found' },
      },
    },
  },
});

const userProfileSchema = {
  type: 'object',
  description: 'Full user profile.',
  properties: {
    id: { type: 'string', format: 'uuid', description: 'User unique identifier.' },
    email: { type: 'string', format: 'email', description: 'Email address.', example: 'alice@example.com' },
    displayName: { type: 'string', description: 'Publicly visible name.', example: 'Alice Streamer' },
    avatarUrl: {
      type: 'string',
      format: 'uri',
      nullable: true,
      description: 'CDN URL of the profile picture, or null if not set.',
      example: 'https://cdn.tiklive.pro/avatars/a1b2c3.jpg',
    },
    subscriptionTier: {
      type: 'string',
      enum: ['free', 'premium'],
      description: 'Current subscription tier.',
      example: 'free',
    },
    locale: { type: 'string', description: 'Preferred UI locale (BCP 47).', example: 'en' },
    socialAccountCount: {
      type: 'integer',
      description: 'Number of connected social accounts (TikTok + Facebook).',
      example: 1,
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

// ---------------------------------------------------------------------------

export function registerUsersRoutes(fastify: FastifyInstance, _deps: { db: NodePgDatabase }): void {
  // GET /users/me ------------------------------------------------------------
  fastify.get(
    '/users/me',
    {
      schema: {
        tags: ['Users'],
        summary: 'Get current user profile',
        description: `
Returns the complete profile of the authenticated user, including their subscription tier and connected social account count.

The profile is populated via the \`auth.user.registered\` NATS event at registration time. Email changes are propagated via \`auth.user.email_changed\` events.
        `.trim(),
        security: bearerAuth,
        response: {
          200: {
            description: 'User profile.',
            type: 'object',
            required: ['data'],
            properties: { data: userProfileSchema },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
          404: errorSchema('User profile not found — may not have been created yet if registration is very recent.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    },
  );

  // PATCH /users/me ----------------------------------------------------------
  fastify.patch(
    '/users/me',
    {
      schema: {
        tags: ['Users'],
        summary: 'Update user profile',
        description: `
Partially updates the authenticated user's profile. Only the fields you include are changed — omitted fields remain unchanged.

**Updatable fields:** \`displayName\`, \`locale\`

To change email or password, use dedicated auth service endpoints (not yet implemented — future work).
To update the avatar, use \`POST /users/me/avatar\`.
        `.trim(),
        security: bearerAuth,
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            displayName: {
              type: 'string',
              minLength: 2,
              maxLength: 50,
              description: 'New public display name.',
              example: 'Alice Pro',
            },
            locale: {
              type: 'string',
              description: 'Preferred UI locale as a BCP 47 language tag.',
              example: 'fr',
            },
          },
        },
        response: {
          200: {
            description: 'Updated user profile.',
            type: 'object',
            required: ['data'],
            properties: { data: userProfileSchema },
          },
          400: errorSchema('Request body is empty — provide at least one field to update.'),
          401: errorSchema('Missing or invalid Bearer token.'),
          422: errorSchema('Validation error — one or more fields failed schema checks.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({ data: {} });
    },
  );

  // POST /users/me/avatar ----------------------------------------------------
  fastify.post(
    '/users/me/avatar',
    {
      schema: {
        tags: ['Users'],
        summary: 'Upload avatar',
        description: `
Uploads a new profile picture for the authenticated user.

**Accepted formats:** JPEG, PNG, WebP
**Maximum file size:** 5 MB
**Output:** the uploaded image is resized to **256×256 pixels** and stored on the CDN. The previous avatar (if any) is deleted.

Use \`Content-Type: multipart/form-data\` with the file under the \`file\` field.
        `.trim(),
        security: bearerAuth,
        consumes: ['multipart/form-data'],
        body: {
          type: 'object',
          required: ['file'],
          properties: {
            file: {
              type: 'string',
              format: 'binary',
              description: 'Image file (JPEG, PNG, or WebP). Maximum 5 MB.',
            },
          },
        },
        response: {
          200: {
            description: 'Avatar uploaded and profile updated.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['avatarUrl'],
                properties: {
                  avatarUrl: {
                    type: 'string',
                    format: 'uri',
                    description: 'CDN URL of the newly uploaded avatar.',
                    example: 'https://cdn.tiklive.pro/avatars/a1b2c3.jpg',
                  },
                },
              },
            },
          },
          400: errorSchema('Invalid or unsupported file type.'),
          401: errorSchema('Missing or invalid Bearer token.'),
          413: errorSchema('File exceeds the 5 MB size limit.'),
          422: errorSchema('No file was provided.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({ data: { avatarUrl: 'https://cdn.tiklive.pro/avatars/placeholder.jpg' } });
    },
  );

  // DELETE /users/me ---------------------------------------------------------
  fastify.delete(
    '/users/me',
    {
      schema: {
        tags: ['Users'],
        summary: 'Delete account',
        description: `
**Permanently** deletes the authenticated user's account and all associated data:
- User profile and credentials
- Connected social accounts (OAuth tokens revoked)
- Live session history
- Billing subscription (canceled immediately)
- All notifications

**This action is irreversible.** The user is logged out immediately on success.

A \`user.deleted\` NATS event is published to trigger cleanup in downstream services.
        `.trim(),
        security: bearerAuth,
        response: {
          204: { description: 'Account deleted. No response body.' },
          401: errorSchema('Missing or invalid Bearer token.'),
          409: errorSchema('Cannot delete account while a live session is in progress. End the session first.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(204).send();
    },
  );
}
