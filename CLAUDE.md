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
    ├── architecture.md  # System overview, service catalogue, data flows, security, deployment
    ├── events.md        # NATS stream catalogue, consumer catalogue, event schemas
    ├── setup.md         # Full local + production setup guide
    ├── infra.md         # Docker, Kubernetes, secrets management reference
    ├── observability.md # OTel, Prometheus, Grafana, Jaeger, alert rules
    └── decisions/       # Architecture Decision Records (ADRs)
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
| web (Next.js) | 3010 | http://localhost:3010 |
| status page | 3011 | http://localhost:3011 |

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

## Frontend Feature Architecture

All frontend code (web and mobile) follows a **feature-first, modular structure**. Every feature is self-contained under `src/features/<feature>/` with these standard subdirectories:

```
src/features/<feature>/
├── components/     # UI components — one component per file, no inline sub-components
├── hooks/          # Custom hooks — one hook per file, co-located with the feature that owns it
├── store/          # Zustand stores — only for state owned by this feature
├── consts/         # Constants (colors, keys, configs) — no magic values in components
├── interfaces/     # TypeScript types and interfaces specific to this feature
└── index.ts        # Barrel file — re-exports everything the feature exposes
```

### Rules

- **No global `hooks/` or `store/` dirs** — hooks and stores live inside their owning feature.
- **Pages are thin** — app pages/screens only import and compose feature components; no data fetching, hooks, or business logic directly in page files.
- **No inline sub-components** — every named component that renders UI lives in its own file under `components/`.
- **No magic strings or values** — all constants (colors, prices, API paths, etc.) go in `consts/<feature>.consts.ts`.
- **Shared utilities** belong in `src/lib/` (e.g., `utils.ts`, `api.ts`, `text.utils.ts`).
- **Cross-feature imports** are fine; import from the feature's `index.ts` barrel when possible.
- **Each feature has an `index.ts`** that re-exports everything the feature exposes to the rest of the app.

### Web-specific layout (`apps/web/src/`)

```
src/
├── app/            # Next.js App Router pages — thin wrappers only
├── features/
│   ├── auth/       # store, hooks (useAuth, useTheme), components (LoginView, AuthIcons)
│   ├── accounts/   # hooks (useSocialAccounts), components (AccountList, AccountCard)
│   ├── comments/   # hooks (useComments), components (CommentFeed, CommentItem)
│   ├── stream/     # store, hooks (useStream, useElapsedTime), components (LiveDashboard, StreamPanel, StatusBadge, StatsCard)
│   └── settings/   # hooks (useSubscription, useTikTokAccounts, …), components (SettingsView, sections)
├── lib/            # api.ts (API_BASE, COMMENTS_WS_URL), utils.ts (cn), text.utils.ts (getInitials)
└── types/
```

### Mobile-specific layout (`apps/mobile/src/`)

```
src/
├── features/
│   ├── auth/       # hooks (useSocialAuth), components (SocialLoginButton), consts (OAUTH_CONFIGS)
│   ├── stream/     # hooks (useElapsedTime, useStopSession), components, consts (AVATAR_COLORS)
│   └── settings/   # hooks (useSubscription, useConnectedAccounts), components (cards)
├── navigation/     # Stack navigators and param list types
├── store/          # Cross-feature stores only (auth.store — used by auth, stream, settings)
├── lib/            # api.ts (API_BASE), text.utils.ts (getInitials)
└── theme/
```

## UI / Responsiveness

All web UI (Next.js app) **must be responsive**. Use mobile-first Tailwind breakpoints (`sm:`, `md:`, `lg:`) on every screen and component. Target widths: 375 px (mobile), 768 px (tablet), 1280 px (desktop). Never ship a web component that is only tested at a single viewport.

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
- **Downstream JWT verification**: the API Gateway verifies the JWT for admission but forwards the raw `Authorization: Bearer` header unchanged — it does **not** inject a decoded user header. Any downstream service handler that needs the caller's identity (`request.user.sub`) must call `await request.jwtVerify()` at the top of the handler before accessing `request.user`.
- **Resource ownership is mandatory**: `jwtVerify()` only proves the caller is *a* user, not *the* owner. Every route scoped to a resource (`/sessions/:sessionId/*`, recordings, etc.) must compare the resource's `userId` against the JWT `sub` and answer **404** on mismatch (not 403 — don't leak existence). Without this, any authenticated user can read another host's ingest key and hijack their stream.
- **SSRF guards**: any endpoint that passes a user-supplied URL to a server-side fetch or ffmpeg must reject private/loopback hosts (see `PRIVATE_IP_RE` in `services/stream-orchestrator/src/interfaces/http/routes.ts`).
- **Host port bindings**: in the prod compose files, every published port must be bound `127.0.0.1:<port>:<port>` — Caddy (host systemd service) terminates TLS and proxies via localhost. Only `1935/tcp` (OBS RTMP ingest) and `8189/udp` (WebRTC ICE) are public. Note that Caddy proxies `/stream-orchestrator/*` **directly** to :3009, bypassing the gateway — anything the orchestrator must not expose publicly (e.g. `/docs`, `/metrics`) has to be blocked in `infra/caddy/Caddyfile`.

## Database Migrations

Each service owns its drizzle schema in `src/infrastructure/db/schema.ts` and migrations in `src/infrastructure/db/migrations/`.

- **Every schema change needs**: the schema edit, a new `NNNN_name.sql` migration file, **and** an entry in `migrations/meta/_journal.json`. Without the journal entry the migration never runs.
- Migrations are applied by the **CI `migrate` job** in `.github/workflows/deploy.yml` (runs `pnpm --filter <service> db:migrate` against Neon for all 9 services before `deploy`). They do NOT run at container startup, and runtime images ship only `dist/` — a migration that isn't in the journal + CI path will silently never reach production.
- **Drizzle upsert trap**: in `onConflictDoUpdate`, the `set` values must use `` sql`excluded."column_name"` ``. Referencing the table's own columns (`status: table.status`) renders as `SET "status" = "table"."status"`, which Postgres resolves to the **existing** row — a silent no-op.
- Postgres does not auto-index FK columns — add an explicit index for any column used in hot lookups (`session_id`, `status`, …).

## Streaming & Concurrency Rules

Hard-won rules from the multi-user production audits (2026-06-15, 2026-07-05):

- **Every spawned ffmpeg process must be registered and killed** on session end AND on graceful shutdown. Relay workers live in `HandleStreamArrivedUseCase` (`stopWorker`/`stopAllWorkers`); video pushes in `infrastructure/ffmpeg/video-push-registry.ts`. An unregistered ffmpeg (`-stream_loop -1` + libx264 ≈ 1 CPU core) outlives its session and keeps the MediaMTX path alive forever.
- **Deliberate kills look like errors**: fluent-ffmpeg emits an `error` event when a process is killed with SIGTERM. Any stop path must suppress that error (see `_stopping` in `FfmpegStreamWorker`) or the retry logic will restart a stream the user just stopped.
- **Guard against duplicate workers per ingest key**: stream arrivals come from multiple concurrent sources (MediaMTX watcher, RTMP server, crash recovery, retry timers). Any new arrival path must go through `HandleStreamArrivedUseCase.execute()` which checks `workers` + `launching` + `retryTimers`.
- **Async callbacks must re-read state**: an error/retry callback firing minutes later holds a stale session entity — re-fetch from the DB and skip if the session is already ENDED before persisting a status transition.
- **HLS tuning is coupled client↔server**: hls.js `liveSyncDuration` in `WatchView.tsx` must stay ≥ 2× `hlsSegmentDuration` in `infra/mediamtx/*.yml`. Changing MediaMTX segment/part durations without updating the player causes stall/seek loops for every viewer.
- **Socket.io server registries are in-memory**: clients must emit `join_as_viewer` / `join_as_streamer` inside `socket.on('connect', …)` (re-fires on reconnect), never once at socket creation. Server-side per-session state must be cleaned up in the `session.ended` NATS handler.
- **Fan-out costs are O(viewers)**: anything emitted to a session room is multiplied by the viewer count. Cap payload sizes (viewer name lists, mediaUrls), debounce bursts, and rate-limit unauthenticated socket events (reactions) per socket AND per session.
- **Per-IP rate limits need the real IP**: services behind Caddy/the gateway must set `trustProxy: true`, and any gateway passthrough must forward `x-forwarded-for` — otherwise "per-IP" limits are platform-global.
- **Pollers**: use recursive `setTimeout` (never `setInterval`), an in-flight guard, a timeout on every awaited call (`AbortSignal.timeout` or `Promise.race` when the interface has no signal), exponential backoff, and a permanent-stop after N consecutive failures.

## Documentation Maintenance — MANDATORY RULE

**Every code change that affects architecture, infrastructure, services, events, or APIs must be accompanied by a documentation update.** Do not defer documentation; update it in the same change.

### Which doc to update

| Change type | File(s) to update |
|-------------|------------------|
| New service or port change | `docs/architecture.md` (Service Catalogue, Deployment Architecture) · `docs/setup.md` (ports table) |
| New or changed NATS stream / event | `docs/events.md` (Stream Catalogue, Consumer Catalogue, Event Reference) · `infra/nats/jetstream-config.yaml` |
| Caddyfile routing change | `docs/infra.md` (Caddy section) |
| New Docker file, ARG, or compose change | `docs/infra.md` (Docker section) |
| Kubernetes manifest added or changed | `docs/infra.md` (Kubernetes section) |
| Prometheus scrape target added | `docs/observability.md` (Prometheus → Scrape jobs) · `infra/observability/prometheus.yml` |
| New alert rule | `docs/observability.md` (Alert Rules table) · `infra/observability/alerts/service-alerts.yml` |
| New OTel pipeline or exporter | `docs/observability.md` (OTel Collector section) |
| New Makefile target | `docs/setup.md` (relevant section) |
| Security model change | `docs/architecture.md` (Security Model) |
| New environment variable | `docs/setup.md` (env vars table) · relevant `.env.example` |
| New DB migration | `migrations/meta/_journal.json` (same change) — applied by the CI `migrate` job, see Database Migrations section |
| CI workflow change (`.github/workflows/deploy.yml`) | `docs/deploy-github-student.md` (Flux de déploiement) |
| Architectural decision | `docs/decisions/` (new ADR file, e.g. `003-topic.md`) |

### How to update

1. **Edit the existing file** — never create a duplicate.
2. **Update the `> Last updated:` date** at the top of the file.
3. **Tables must stay complete** — if you add a service, add it to every table in the relevant docs that lists services.
4. **Code examples must match reality** — if you rename a Make target, update every `make <target>` reference in the docs.
5. **Do not remove existing sections** — append or edit; deletion is only appropriate when a feature is fully removed.

### ADR format (`docs/decisions/NNN-title.md`)

```markdown
# NNN. Short title

**Date:** YYYY-MM-DD
**Status:** Accepted | Deprecated | Superseded by [NNN](./NNN-title.md)

## Context
What is the problem or situation requiring a decision?

## Decision
What did we decide?

## Consequences
What are the trade-offs, known downsides, or future work this implies?
```
