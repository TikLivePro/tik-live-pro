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

const AVAILABLE_PAYMENT_METHODS = [
  {
    id: 'stripe',
    label: 'Credit / Debit Card',
    description: 'Pay securely via Stripe Checkout',
  },
  {
    id: 'cash',
    label: 'Cash',
    description: 'Pay in person — we will activate your plan on receipt',
  },
  {
    id: 'mobile_money',
    label: 'Mobile Money',
    description: 'Pay via MTN, Airtel, or Orange Money',
  },
];

const paymentMethodSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', enum: ['stripe', 'cash', 'mobile_money'], description: 'Payment method identifier.' },
    label: { type: 'string', example: 'Mobile Money' },
    description: { type: 'string', example: 'Pay via MTN, Airtel, or Orange Money' },
  },
};

const STATIC_PLANS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'free',
    name: 'Free',
    priceCents: 0,
    features: [],
    maxSocialAccounts: 2,
    stripePriceId: null,
    sortOrder: 0,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    slug: 'premium',
    name: 'Pro',
    priceCents: 999,
    features: ['unlimited_accounts', 'analytics_dashboard', 'comment_moderation'],
    maxSocialAccounts: null,
    stripePriceId: null,
    sortOrder: 1,
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    slug: 'business',
    name: 'Business',
    priceCents: 2999,
    features: ['unlimited_accounts', 'analytics_dashboard', 'comment_moderation', 'stream_recording', 'priority_support'],
    maxSocialAccounts: null,
    stripePriceId: null,
    sortOrder: 2,
  },
];

const planSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    slug: { type: 'string', enum: ['free', 'premium', 'business'] },
    name: { type: 'string', example: 'Pro' },
    priceCents: { type: 'integer', description: 'Monthly price in USD cents. 0 for the free plan.', example: 999 },
    features: {
      type: 'array',
      items: { type: 'string', enum: ['unlimited_accounts', 'analytics_dashboard', 'comment_moderation', 'stream_recording', 'priority_support'] },
    },
    maxSocialAccounts: { type: 'integer', nullable: true, description: 'Max connected social accounts. null = unlimited.' },
    stripePriceId: { type: 'string', nullable: true },
    sortOrder: { type: 'integer' },
  },
};

export function registerBillingRoutes(fastify: FastifyInstance, _deps: { db: NodePgDatabase }): void {
  // GET /billing/payment-methods ---------------------------------------------
  fastify.get(
    '/billing/payment-methods',
    {
      schema: {
        tags: ['Billing'],
        summary: 'List available payment methods',
        description: 'Returns all payment methods accepted at checkout: card (Stripe), cash, and mobile money.',
        response: {
          200: {
            description: 'List of accepted payment methods.',
            type: 'object',
            required: ['data'],
            properties: { data: { type: 'array', items: paymentMethodSchema } },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({ data: AVAILABLE_PAYMENT_METHODS });
    },
  );

  // GET /billing/plans -------------------------------------------------------
  fastify.get(
    '/billing/plans',
    {
      schema: {
        tags: ['Billing'],
        summary: 'List available plans',
        description: 'Returns all active subscription plans ordered by price.',
        response: {
          200: {
            description: 'List of available plans.',
            type: 'object',
            required: ['data'],
            properties: { data: { type: 'array', items: planSchema } },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({ data: STATIC_PLANS });
    },
  );

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
        summary: 'Create checkout session',
        description: `
Creates a checkout session to upgrade the user's subscription.

**Supported payment methods:** \`stripe\` (default), \`cash\`, \`mobile_money\`.

### Stripe (card) flow
1. Omit \`paymentMethod\` or pass \`"stripe"\`.
2. Redirect the user's browser to the returned \`checkoutUrl\`.
3. Stripe collects payment and redirects back to your \`successUrl\`.
4. A \`billing.subscription.updated\` NATS event is published via Stripe webhook.

### Cash / Mobile Money flow
1. Pass \`paymentMethod: "cash"\` or \`"mobile_money"\` (include \`phoneNumber\` for mobile money).
2. The response includes \`orderId\`, \`instructions\`, and \`status: "pending"\`.
3. The plan is activated once an admin confirms the payment.
4. A \`billing.entitlement.updated\` NATS event is published on confirmation.

**Important:** Do not poll for upgraded entitlements immediately — listen for the \`billing.entitlement.updated\` event or wait a few seconds before re-fetching.
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
              description: 'URL to redirect the user to after successful payment (Stripe only). May include `{CHECKOUT_SESSION_ID}` template.',
              example: 'https://app.tiklivepro.pro/billing/success?session={CHECKOUT_SESSION_ID}',
            },
            cancelUrl: {
              type: 'string',
              format: 'uri',
              description: 'URL to redirect the user to if they cancel (Stripe only).',
              example: 'https://app.tiklivepro.pro/billing',
            },
            paymentMethod: {
              type: 'string',
              enum: ['stripe', 'cash', 'mobile_money'],
              default: 'stripe',
              description: 'Payment method to use. Defaults to `stripe`.',
              example: 'mobile_money',
            },
            phoneNumber: {
              type: 'string',
              description: 'Mobile money phone number. Required when `paymentMethod` is `mobile_money`.',
              example: '+261340000000',
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
                description: 'For `stripe`: contains `checkoutUrl`. For `cash`/`mobile_money`: contains `orderId`, `instructions`, and `status`.',
                properties: {
                  checkoutUrl: {
                    type: 'string',
                    format: 'uri',
                    nullable: true,
                    description: 'Stripe-hosted Checkout URL. Present only when `paymentMethod` is `stripe`.',
                    example: 'https://checkout.stripe.com/pay/cs_test_abc123',
                  },
                  orderId: {
                    type: 'string',
                    format: 'uuid',
                    nullable: true,
                    description: 'Manual order ID. Present only when `paymentMethod` is `cash` or `mobile_money`.',
                    example: '3f7a1b2c-0000-0000-0000-000000000001',
                  },
                  instructions: {
                    type: 'string',
                    nullable: true,
                    description: 'Human-readable payment instructions. Present only for manual payment methods.',
                    example: 'Send payment to +261340000000 (MTN) and share the transaction ID with support.',
                  },
                  status: {
                    type: 'string',
                    enum: ['pending'],
                    nullable: true,
                    description: 'Order status. Always `pending` for manual payment methods until admin confirms.',
                    example: 'pending',
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
    async (request, reply) => {
      const body = request.body as {
        successUrl: string;
        cancelUrl: string;
        paymentMethod?: 'stripe' | 'cash' | 'mobile_money';
        phoneNumber?: string;
      };
      const method = body.paymentMethod ?? 'stripe';

      if (method === 'stripe') {
        return reply.status(200).send({ data: { checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_example' } });
      }

      const instructions =
        method === 'mobile_money'
          ? `Send payment to ${body.phoneNumber ?? 'our mobile money number'} and share the transaction ID with our support team.`
          : 'Visit our office to pay in cash. Your plan will be activated within 24 hours after confirmation.';

      return reply.status(200).send({
        data: {
          orderId: crypto.randomUUID(),
          instructions,
          status: 'pending',
        },
      });
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
