# TikLivePro — Claude Code Guide

## Project Overview

TikLivePro is a production-grade live-streaming platform enabling users to broadcast simultaneously to TikTok and Facebook, view aggregated real-time comments, and manage connected social accounts. It is built on a microservices architecture with event-driven communication via NATS JetStream.

## Repository Layout

```
tik-live-pro/
├── apps/
│   ├── web/          # Next.js 15 + Tailwind CSS v4.3
│   └── mobile/       # React Native + styled-components/native
├── services/
│   ├── api-gateway/          # BFF, rate limiting, auth middleware
│   ├── auth/                 # JWT auth, refresh tokens
│   ├── users/                # User profiles, preferences
│   ├── integrations/         # Social account OAuth management
│   ├── live-session/         # Session lifecycle management
│   ├── stream-orchestrator/  # Multi-destination broadcast coordination
│   ├── comments/             # Real-time comment aggregation
│   ├── billing/              # Stripe subscriptions, entitlements
│   ├── notifications/        # Push + email notifications
│   └── analytics/            # Usage analytics, reporting
├── packages/
│   ├── shared-types/    # Shared TypeScript interfaces and types
│   ├── events/          # NATS JetStream subjects + event schemas
│   ├── logger/          # Structured pino logger
│   ├── config/          # Env validation via zod
│   ├── validation/      # Shared Zod schemas
│   ├── i18n/            # Translation keys (en, fr)
│   ├── domain/          # Shared domain primitives (Value Objects, errors)
│   └── platform-adapters/ # TikTok + Facebook adapter implementations
├── infra/
│   ├── docker/          # Service Dockerfiles
│   ├── kubernetes/      # K8s manifests
│   ├── helm/            # Helm charts
│   ├── nats/            # NATS JetStream configuration
│   └── observability/   # Prometheus, Grafana, OpenTelemetry
└── docs/
    ├── architecture.md
    ├── events.md
    ├── setup.md
    └── decisions/       # Architecture Decision Records
```

## Architecture Principles

### Clean Architecture (per service)
```
src/
├── domain/           # Entities, Value Objects, Repository interfaces, Domain Events
├── application/      # Use Cases, DTOs, Application Services, Ports
├── infrastructure/   # DB adapters, HTTP clients, NATS publisher, Repositories impl
└── interfaces/       # HTTP controllers, WebSocket handlers, CLI
```
**Dependency rule**: dependencies point inward only. Infrastructure depends on Application; Application depends on Domain. Domain depends on nothing.

### Event-Driven Design
- All cross-service communication via NATS JetStream subjects defined in `packages/events/src/subjects.ts`
- Events carry: `eventId`, `version`, `occurredAt`, `correlationId`, `traceId`, `payload`
- Dead-letter streams: `DLQ.*` for failed events
- Idempotency: consumers deduplicate on `eventId`

### Platform Extensibility
New platforms are added by:
1. Implementing `IPlatformAdapter` in `packages/platform-adapters/src/`
2. Registering the adapter in the `integrations` service
3. No changes to core services required

## Key Commands

```bash
# Install dependencies
pnpm install

# Start all services in dev mode
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Start local infrastructure (NATS, Postgres, Redis)
pnpm docker:dev

# Build all packages and services
pnpm build
```

## Environment Setup

Copy `.env.example` to `.env` in each service directory. Required variables are validated at startup via Zod — the service will refuse to start if any required variable is missing.

## API Documentation (Swagger)

Every service registers `@fastify/swagger` (v9) + `@fastify/swagger-ui` (v5) and exposes its OpenAPI 3.1 spec at `/docs`.

### Canonical reference
The **API Gateway** at `http://localhost:3000/docs` is the single external-facing reference. It uses a static OpenAPI spec that documents every route across all services. Individual service docs (`:3001/docs`, `:3002/docs`, …) document the internal HTTP API and are useful during development.

### Service ports and docs URLs
| Service | Port | Docs |
|---------|------|------|
| api-gateway | 3000 | http://localhost:3000/docs |
| auth | 3001 | http://localhost:3001/docs |
| users | 3002 | http://localhost:3002/docs |
| live-session | 3003 | http://localhost:3003/docs |
| billing | 3004 | http://localhost:3004/docs |
| integrations | 3005 | http://localhost:3005/docs |
| comments | 3006 | http://localhost:3006/docs |
| notifications | 3007 | http://localhost:3007/docs |
| analytics | 3008 | http://localhost:3008/docs |
| stream-orchestrator | 3009 | http://localhost:3009/docs |

### Adding Swagger to a new route

Every new Fastify route **must** include a `schema` block. The minimum required fields are `tags`, `summary`, and `response`. Use `security` for protected routes.

```typescript
fastify.post(
  '/resource',
  {
    schema: {
      tags: ['ResourceGroup'],          // groups routes in the UI sidebar
      summary: 'Create a resource',     // one-line description
      description: `
Longer description with markdown. Explain side effects, constraints, related events.
      `.trim(),
      security: [{ BearerAuth: [] }],   // REQUIRED on all protected routes
      body: {
        type: 'object',
        required: ['field'],
        additionalProperties: false,
        properties: {
          field: {
            type: 'string',
            description: 'What this field is for.',
            example: 'some value',
          },
        },
      },
      response: {
        201: {
          description: 'Resource created.',
          type: 'object',
          properties: { data: { /* ... */ } },
        },
        401: {
          description: 'Missing or invalid Bearer token.',
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'UNAUTHORIZED' },
                message: { type: 'string', example: 'Token expired' },
              },
            },
          },
        },
      },
    },
  },
  async (request, reply) => { /* handler */ },
);
```

### Security scheme

The `BearerAuth` HTTP security scheme is defined in every service's swagger plugin config:
```typescript
components: {
  securitySchemes: {
    BearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
  },
},
```

- **Public routes** (e.g., `/auth/*`, OAuth callbacks, health checks): no `security` field.
- **Protected routes**: always add `security: [{ BearerAuth: [] }]`.
- Do not add `security` to the swagger plugin config globally — set it per-route so public routes remain clearly unprotected.

### API Gateway swagger approach

The gateway is a pure proxy — its routes have no Fastify schemas. Its swagger is built as a **static OpenAPI spec** passed to `@fastify/swagger` via `openapi.paths`. When adding or changing a route that flows through the gateway, update the static spec in `services/api-gateway/src/main.ts` (`openapi.paths` object) to match.

### Swagger plugin registration order

Register swagger plugins **before** routes:
```typescript
await fastify.register(fastifyHelmet);
await fastify.register(fastifyCors, ...);
await fastify.register(fastifyJwt, ...);
await fastify.register(fastifySwagger, { openapi: { ... } });   // ← before routes
await fastify.register(fastifySwaggerUi, { routePrefix: '/docs' }); // ← before routes
registerMyRoutes(fastify);  // ← after swagger
```

## Coding Standards

- **No `any`**: use `unknown` and narrow with type guards
- **Explicit return types** on all exported functions
- **No hardcoded strings** in UI — use i18n keys from `packages/i18n`
- **No platform logic** in `live-session` or `comments` services — delegate to adapters
- **Tests required** for all domain use cases and value objects
- **Correlation IDs** must be propagated in all inter-service calls and events
- **Swagger schemas required** for every new HTTP route — no schema-less routes

## Adding a New Platform

1. Add platform to `SocialPlatform` enum in `packages/shared-types/src/social.types.ts`
2. Create `packages/platform-adapters/src/platforms/<platform>/` implementing `IPlatformAdapter`
3. Add OAuth credentials to `services/integrations/src/infrastructure/oauth/`
4. Add platform-specific event subjects in `packages/events/src/subjects.ts` if needed
5. Update i18n keys for the platform name
6. Add an integration test in `services/integrations/tests/`
7. Update the `integrations` service Swagger: add the new OAuth start/callback routes to `integrations.routes.ts`
8. Update the **API Gateway static spec** in `services/api-gateway/src/main.ts` under `openapi.paths`

## Monetization / Entitlements

Entitlement checks live in `services/billing/src/domain/policies/`. The `SubscriptionPolicy` class exposes:
- `canAddSocialAccount(userId)` — enforces freemium 2-account limit
- `hasFeature(userId, feature)` — feature flag checks

Never check subscription status directly in other services — call the billing service or consume `billing.entitlement.updated` events.

## Observability

- All services emit structured JSON logs via `packages/logger`
- OpenTelemetry traces are exported to the OTLP collector
- Health: `GET /health` (liveness), `GET /ready` (readiness)
- Metrics: `GET /metrics` (Prometheus format)

## Security Notes

- JWT secrets must be at least 64 characters and stored in secrets manager, not env files in production
- Platform OAuth tokens are encrypted at rest using AES-256-GCM before storage
- All user input is validated with Zod schemas before reaching use cases
- Rate limiting is applied at the API Gateway level
