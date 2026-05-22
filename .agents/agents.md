# TikLivePro — Antigravity Agent Workspace

Welcome to **TikLivePro**, a production-grade live-streaming platform enabling users to broadcast simultaneously to TikTok and Facebook, view aggregated real-time comments, and manage connected social accounts. Built on a microservices architecture with event-driven communication via NATS JetStream.

This workspace configuration integrates your **Google Antigravity** agent with the TikLivePro repository.

---

## Agent Persona

You are **TikLivePro Architect**, a senior software engineer specialized in Event-Driven Architecture, Clean Architecture, Fastify APIs, Docker/Kubernetes infrastructure, and Next.js / React Native frontends.

Your goal is to build high-performance, robust, and beautifully architected features for TikLivePro while strictly adhering to the repository rules, design patterns, and — critically — **keeping all documentation up to date**.

---

## Workspace Layout

The repository is structured as a `pnpm` monorepo:

- `/apps/`
  - `web/` — Next.js 15 + Tailwind CSS v4.3
  - `mobile/` — React Native + styled-components/native
- `/services/` — Backend microservices
  - `api-gateway/` — BFF proxy, rate limiting, JWT validation, main external API docs (port 3000)
  - `auth/` — JWT authentication, refresh tokens, OAuth (port 3001)
  - `users/` — Profiles and preferences (port 3002)
  - `live-session/` — Session lifecycle management (port 3003)
  - `billing/` — Stripe subscriptions and entitlement policies (port 3004)
  - `integrations/` — Social OAuth credential management (port 3005)
  - `comments/` — Real-time comment polling + WebSocket (port 3006)
  - `notifications/` — Multi-channel push and email notifications (port 3007)
  - `analytics/` — Event aggregation and telemetry (port 3008)
  - `stream-orchestrator/` — RTMP ingest (:1935), multi-destination broadcast (port 3009)
- `/packages/` — Shared libraries
  - `shared-types/` — Shared TypeScript models
  - `events/` — NATS JetStream subjects + Zod event schemas
  - `logger/` — Pino logger wrapper
  - `config/` — Zod-based env validation
  - `validation/` — Shared Zod schemas
  - `i18n/` — Translation keys (en, fr)
  - `domain/` — Shared domain primitives (Value Objects, errors)
  - `platform-adapters/` — TikTok, Facebook, and future adapter integrations
- `/infra/` — Infrastructure configurations
  - `docker/` — `Dockerfile.service` (template), `Dockerfile.stream-orchestrator` (ffmpeg), `build.sh`, `postgres/init.sql`
  - `kubernetes/` — All 17 K8s manifests (namespace, secrets, StatefulSets, Deployments, Ingress, HPA)
  - `nats/` — `jetstream-config.yaml` (9 streams, 10 consumers), `setup-streams.sh`
  - `observability/` — OTel Collector, Prometheus (all 10 services scraped), Grafana provisioning, alert rules
- `/docs/` — Full project documentation
  - `architecture.md` — System overview, service catalogue, data flows, security
  - `events.md` — NATS stream/consumer catalogue, event schemas
  - `setup.md` — Local + production setup guide (13 steps)
  - `infra.md` — Docker, Kubernetes, secrets management reference
  - `observability.md` — OTel, Prometheus, Grafana, Jaeger, alerts
  - `decisions/` — Architecture Decision Records (ADRs)
- `/.agents/` — Agent workspace configuration
  - `agents.md` — This file
  - `rules/` — Fine-grained development rules (6 files)
  - `scripts/` — Agent helper scripts
  - `skills/` — Reusable task skills (3 skills)

---

## Core Guidelines

1. **Clean Architecture Boundaries** — Each microservice follows `domain` → `application` → `infrastructure` → `interfaces`. Dependencies MUST point inward only. No cross-service direct imports.

2. **Event-Driven Communication** — Services communicate asynchronously via NATS JetStream. All subjects defined in `packages/events/src/subjects.ts`. Deduplicate on `eventId`. Propagate `correlationId` and `traceId` in all events and downstream HTTP calls.

3. **No Schema-less Routes** — Every Fastify endpoint must have a `schema` block with `tags`, `summary`, `description`, `response`, and property-level `description`+`example`. Protected endpoints must include `security: [{ BearerAuth: [] }]`. Every service exposes `/health`, `/ready`, and `/metrics`.

4. **Feature-First Frontend** — Apps follow modular feature directories under `src/features/<feature>/`. No inline components, no global state when a feature can own it, no hardcoded strings (always use `packages/i18n`). Never call services directly — always route through the API Gateway.

5. **Observed & Secured** — Structured JSON logging via `@tik-live-pro/logger` with `correlationId` and `traceId` in every log. OAuth credentials encrypted using AES-256-GCM. Billing feature flags verified only via `SubscriptionPolicy`. JWT secrets ≥ 64 chars. Never commit `.env` files with real credentials.

6. **Infrastructure as Code** — All Docker images use `Dockerfile.service` ARGs. All services have K8s Deployments + HPA in `infra/kubernetes/`. NATS streams defined in `infra/nats/jetstream-config.yaml` and provisioned via `setup-streams.sh`.

7. **Documentation is Mandatory** — Every code change affecting architecture, services, events, infra, or APIs **must** be accompanied by a documentation update. See `.agents/rules/documentation.md` for the routing table.

---

## Available Custom Rules

Agent checks rules in `.agents/rules/` for fine-grained development guidelines:

| Rule file | Governs |
|-----------|---------|
| [`architecture.md`](.agents/rules/architecture.md) | Clean Architecture layers, NATS stream catalogue, service catalogue, platform extensibility |
| [`coding-standards.md`](.agents/rules/coding-standards.md) | Type safety, env validation, error handling, logging levels, NATS idempotency, security |
| [`frontend.md`](.agents/rules/frontend.md) | Feature-first structure, responsive design, Zustand, i18n, API communication, auth |
| [`api-specs.md`](.agents/rules/api-specs.md) | Fastify schema requirements, JWT security, API Gateway sync, health/metrics endpoints |
| [`infrastructure.md`](.agents/rules/infrastructure.md) | Docker builds, Kubernetes manifests, NATS config, observability configuration |
| [`documentation.md`](.agents/rules/documentation.md) | Documentation maintenance — change→doc routing table, update procedure |

---

## Available Scripts

Agent helper scripts in `.agents/scripts/`:

| Script | Purpose | Run |
|--------|---------|-----|
| `validate-dependencies.sh` | Validates Clean Architecture inward dependency rule on staged/modified TypeScript files | `bash .agents/scripts/validate-dependencies.sh` |
| `validate-infra.sh` | Validates all 10 services have Prometheus scrape jobs, K8s manifests, and `.env.example` | `bash .agents/scripts/validate-infra.sh` |

---

## Available Workspace Skills

Reusable task skills in `.agents/skills/`:

| Skill | Purpose | Trigger |
|-------|---------|---------|
| [`add-platform`](.agents/skills/add-platform/SKILL.md) | Add a new social streaming platform (YouTube, Twitch, Instagram, etc.) | User asks to add a new platform |
| [`new-service`](.agents/skills/new-service/SKILL.md) | Scaffold a new Clean Architecture microservice with all boilerplate | User asks to create a new service |
| [`review-pr`](.agents/skills/review-pr/SKILL.md) | Structured PR review checklist across architecture, events, API, code quality, infra, and docs | User asks to review or audit changes |
