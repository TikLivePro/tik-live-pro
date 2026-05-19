import type { FastifyInstance } from 'fastify';

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
        message: { type: 'string', description: 'Human-readable error message.', example: 'No active subscription found' },
      },
    },
  },
});

const subscriptionSchema = {
  type: 'object',
  description: 'Stripe subscription record.',
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Internal subscription ID.' },
    userId: { type: 'string', format: 'uuid' },
    tier: { type: 'string', enum: ['free', 'premium'], description: 'Subscription tier.', example: 'premium' },
    status: {
      type: 'string',
      enum: ['active', 'canceled', 'past_due', 'trialing'],
      description: 'Stripe subscription status.',
      example: 'active',
    },
    stripeSubscriptionId: { type: 'string', nullable: true, description: 'Stripe subscription ID.', example: 'sub_1234567890' },
    currentPeriodStart: { type: 'string', format: 'date-time', description: 'Start of the current billing period.' },
    currentPeriodEnd: { type: 'string', format: 'date-time', description: 'End of the current billing period. Downgrade occurs after this date if canceled.' },
    canceledAt: { type: 'string', format: 'date-time', nullable: true, description: 'ISO timestamp of when the subscription was canceled, or null.' },
  },
};

const entitlementSchema = {
  type: 'object',
  description: 'Resolved entitlements for the user — what they are allowed to do based on their active subscription.',
  properties: {
    userId: { type: 'string', format: 'uuid' },
    tier: { type: 'string', enum: ['free', 'premium'], description: 'Active subscription tier.', example: 'free' },
    features: {
      type: 'array',
      description: 'Features enabled for this user. Empty on the free plan.',
      items: {
        type: 'string',
        enum: ['unlimited_accounts', 'analytics_dashboard', 'comment_moderation', 'stream_recording'],
      },
      example: ['unlimited_accounts', 'analytics_dashboard'],
    },
    maxSocialAccounts: {
      type: 'integer',
      description: 'Maximum number of connected social accounts allowed. Free plan: 2. Premium: unlimited (represented as a very large number).',
      example: 2,
    },
  },
};

// ---------------------------------------------------------------------------

export function registerBillingRoutes(fastify: FastifyInstance): void {
  // GET /billing/entitlements ------------------------------------------------
  fastify.get(
    '/billing/entitlements',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Get current entitlements',
        description: `
Returns the resolved entitlement record for the authenticated user.

Entitlements are derived from the user's active subscription and cached via NATS events (\`billing.entitlement.updated\`). Other services should not query this endpoint directly — instead subscribe to the event.

**Free plan entitlements:**
- Up to 2 connected social accounts
- No premium features

**Premium plan entitlements:**
- Unlimited connected social accounts
- All features: \`unlimited_accounts\`, \`analytics_dashboard\`, \`comment_moderation\`, \`stream_recording\`
        `.trim(),
        security: bearerAuth,
        response: {
          200: {
            description: 'Entitlement record for the authenticated user.',
            type: 'object',
            required: ['data'],
            properties: { data: entitlementSchema },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({
        data: {
          userId: crypto.randomUUID(),
          tier: 'free',
          features: [],
          maxSocialAccounts: 2,
        },
      });
    },
  );

  // GET /billing/subscriptions/current ---------------------------------------
  fastify.get(
    '/billing/subscriptions/current',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Get current subscription',
        description: `
Returns the active Stripe subscription for the authenticated user.

Free-plan users have no Stripe record — this endpoint returns HTTP 404 for them. Check \`GET /billing/entitlements\` instead for a normalized view that works for all tiers.
        `.trim(),
        security: bearerAuth,
        response: {
          200: {
            description: 'Current subscription.',
            type: 'object',
            required: ['data'],
            properties: { data: subscriptionSchema },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
          404: errorSchema('No Stripe subscription found. The user is on the free plan.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No active subscription' } });
    },
  );

  // POST /billing/subscriptions/checkout -------------------------------------
  fastify.post(
    '/billing/subscriptions/checkout',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Create Stripe Checkout session',
        description: `
Creates a Stripe Checkout session to upgrade the user from FREE to PREMIUM.

**Client flow:**
1. Call this endpoint with \`successUrl\` and \`cancelUrl\`.
2. Redirect the user's browser to the returned \`checkoutUrl\`.
3. Stripe collects payment and redirects back to your \`successUrl\`.
4. A \`billing.subscription.updated\` NATS event is published automatically via Stripe webhook → billing service.
5. The user's entitlements are upgraded asynchronously.

**Important:** Do not poll for upgraded entitlements immediately after payment — instead listen for the \`billing.entitlement.updated\` event or wait a few seconds before re-fetching.
        `.trim(),
        security: bearerAuth,
        body: {
          type: 'object',
          required: ['successUrl', 'cancelUrl'],
          additionalProperties: false,
          properties: {
            successUrl: {
              type: 'string',
              format: 'uri',
              description: 'URL Stripe redirects the user to after successful payment. May include `{CHECKOUT_SESSION_ID}` template.',
              example: 'https://app.tiklive.pro/billing/success?session={CHECKOUT_SESSION_ID}',
            },
            cancelUrl: {
              type: 'string',
              format: 'uri',
              description: 'URL Stripe redirects the user to if they cancel without completing payment.',
              example: 'https://app.tiklive.pro/billing',
            },
          },
        },
        response: {
          200: {
            description: 'Checkout session created.',
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['checkoutUrl'],
                properties: {
                  checkoutUrl: {
                    type: 'string',
                    format: 'uri',
                    description: 'Stripe-hosted Checkout URL. Redirect the user here to complete payment.',
                    example: 'https://checkout.stripe.com/pay/cs_test_abc123',
                  },
                },
              },
            },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
          409: errorSchema('User already has an active Premium subscription.'),
          422: errorSchema('Validation error — invalid request body.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({ data: { checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_example' } });
    },
  );

  // POST /billing/subscriptions/cancel ---------------------------------------
  fastify.post(
    '/billing/subscriptions/cancel',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Cancel subscription',
        description: `
Schedules the user's Stripe subscription for cancellation at the end of the current billing period.

**What happens:**
- The subscription status becomes \`canceled\` in Stripe at period end.
- The user retains Premium access until \`currentPeriodEnd\`.
- After that, entitlements are downgraded to FREE tier and a \`billing.entitlement.updated\` event is published.

**This action cannot be undone** — the user must create a new checkout session to re-subscribe.
        `.trim(),
        security: bearerAuth,
        response: {
          200: {
            description: 'Subscription scheduled for cancellation.',
            type: 'object',
            required: ['data'],
            properties: { data: subscriptionSchema },
          },
          401: errorSchema('Missing or invalid Bearer token.'),
          404: errorSchema('No active subscription to cancel.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No active subscription' } });
    },
  );

  // POST /billing/webhooks/stripe --------------------------------------------
  fastify.post(
    '/billing/webhooks/stripe',
    {
      schema: {
        tags: ['Billing'],
        summary: 'Stripe webhook receiver',
        description: `
Receives and processes Stripe webhook events. **Do not call this endpoint directly.**

Stripe calls this endpoint automatically when subscription lifecycle events occur:
| Event | Action |
|---|---|
| \`checkout.session.completed\` | Activate subscription, publish \`billing.subscription.created\` |
| \`invoice.payment_succeeded\` | Renew period, publish \`billing.subscription.renewed\` |
| \`invoice.payment_failed\` | Mark subscription as \`past_due\`, notify user |
| \`customer.subscription.deleted\` | Downgrade to FREE, publish \`billing.entitlement.updated\` |

**Security:** every incoming request is verified using the Stripe webhook signing secret (\`STRIPE_WEBHOOK_SECRET\`) before processing.
        `.trim(),
        headers: {
          type: 'object',
          required: ['stripe-signature'],
          properties: {
            'stripe-signature': {
              type: 'string',
              description: 'HMAC signature added by Stripe for payload verification.',
            },
          },
        },
        response: {
          200: {
            description: 'Event acknowledged by the billing service.',
            type: 'object',
            properties: { received: { type: 'boolean', example: true } },
          },
          400: errorSchema('Stripe signature verification failed — payload may have been tampered with.'),
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({ received: true });
    },
  );
}
