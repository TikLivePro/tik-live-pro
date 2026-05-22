# Rule: TikLivePro Architecture Guidelines

This rule enforces monorepo structure, Clean Architecture boundaries per microservice, event-driven communication via NATS JetStream, and social platform extensibility.

> **Keep in sync with:** `docs/architecture.md` · `docs/events.md`

---

## 1. Clean Architecture Boundaries

Every backend microservice inside `/services/` must isolate code into these four inward-pointing layers:

```
src/
├── domain/           # Entities, Value Objects, Repository Interfaces, Domain Events
├── application/      # Use Cases, DTOs, Application Services, Ports
├── infrastructure/   # DB Adapters, HTTP/NATS clients, Repository Concrete Impls
└── interfaces/       # HTTP/WebSocket handlers, Fastify controllers, CLI commands
```

### Dependency Rules

- Dependencies **MUST** point inward only.
- **Domain** is completely independent and has no dependencies on other layers or frameworks.
- **Application** depends only on Domain.
- **Infrastructure** depends on Application and Domain.
- **Interfaces** depend on Application and Domain.
- Cross-service direct imports are **STRICTLY PROHIBITED**. Cross-service communication must flow through NATS JetStream events or API Gateway HTTP proxy.

---

## 2. Event-Driven Communication

TikLivePro uses NATS JetStream as its event bus.

- All cross-service events must use subjects defined in `packages/events/src/subjects.ts`.
- Every event payload must include:
  - `eventId` — UUIDv4, used for idempotency deduplication
  - `version` — integer, incremented on breaking schema changes
  - `occurredAt` — ISO 8601 UTC timestamp
  - `correlationId` — propagated from the originating HTTP request header (`x-correlation-id`)
  - `traceId` — OpenTelemetry W3C trace ID
  - `payload` — typed event data
- Consumers **must** deduplicate events using `eventId` to guarantee idempotency.
- Failed messages (after exhausting `max_deliver` retries) must be routed to the DLQ: `dlq.<original-subject>`.
- New subjects and event schemas must be registered in:
  1. `packages/events/src/subjects.ts`
  2. `infra/nats/jetstream-config.yaml` (add to the relevant stream's subjects)
  3. `docs/events.md` (Event Reference section)

### JetStream Streams

| Stream | Subjects | Retention |
|--------|---------|-----------|
| AUTH | `auth.>` | limits |
| USERS | `user.>` | limits |
| SESSIONS | `session.>`, `stream.>` | limits |
| BILLING | `billing.>` | limits |
| INTEGRATIONS | `integration.>` | limits |
| COMMENTS | `comment.>` | limits |
| NOTIFICATIONS | `notification.>` | **workqueue** |
| ANALYTICS | `analytics.>` | limits |
| DLQ | `dlq.>` | limits |

All streams use `replicas: 3` to match the 3-node NATS cluster. Duration format uses Go strings (`168h`, not `7d`).

---

## 3. Platform Extensibility

Third-party social platforms (TikTok, Facebook, YouTube, etc.) are integrated using adapters:

- Adapters must implement `IPlatformAdapter` in `packages/platform-adapters/src/interface/platform-adapter.interface.ts`.
- Core services (`live-session`, `comments`) must remain decoupled from specific platforms — delegate all stream/comment HTTP logic to `platform-adapters`.
- New platform adapters must be registered in the `integrations` service.
- Adding a platform requires updates in this order:
  1. `packages/shared-types/src/social.types.ts` — add to `SocialPlatform` enum
  2. `packages/platform-adapters/src/platforms/<platform>/` — implement `IPlatformAdapter`
  3. `services/integrations/` — register OAuth credentials and adapter
  4. `packages/events/src/subjects.ts` — add platform-specific subjects if needed
  5. `packages/i18n/` — add platform name keys
  6. `services/api-gateway/src/main.ts` — update static OpenAPI spec
  7. `docs/architecture.md` — update Supported Platforms table

---

## 4. Service Catalogue

| Service | Port | Database | Notes |
|---------|------|----------|-------|
| api-gateway | 3000 | — | BFF, JWT validation, rate limiting |
| auth | 3001 | `tiklive_auth` | JWT issue/refresh, OAuth |
| users | 3002 | `tiklive_users` | Profiles, preferences |
| live-session | 3003 | `tiklive_sessions` | Session lifecycle |
| billing | 3004 | `tiklive_billing` | Stripe, entitlements |
| integrations | 3005 | `tiklive_integrations` | Social OAuth tokens (AES-256-GCM encrypted) |
| comments | 3006 | `tiklive_comments` | Comment polling + WebSocket |
| notifications | 3007 | `tiklive_notifications` | Push/email via workqueue |
| analytics | 3008 | `tiklive_analytics` | Event aggregation |
| stream-orchestrator | 3009 | `tiklive_stream` | RTMP ingest (:1935), platform broadcast |

When adding a new service, also update `docs/architecture.md`, `docs/setup.md`, and `infra/observability/prometheus.yml`.
