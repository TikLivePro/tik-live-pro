# Skill: Review a Pull Request

This skill runs a structured, high-quality assessment of any incoming monorepo code modifications.

---

## Preconditions / Trigger Criteria

Use this skill when:
- The user requests to review or audit a pull request or code changes.
- Preparing a list of architectural corrections before staging or merging changes.

---

## Review Checklist

### 1. Architectural Boundaries

- [ ] Inward dependency rule: `interfaces` → `application` → `domain` (domain is framework-independent)
- [ ] `infrastructure` does not import from `interfaces`
- [ ] No platform-specific code leaked into core services (`live-session`, `comments`) — must be in `platform-adapters`
- [ ] No cross-service direct source imports — services must only communicate via NATS events or API Gateway HTTP
- [ ] No cross-service database transactions — each service queries only its own schema
- [ ] Application Use Cases adhere to Single Responsibility

Run `bash .agents/scripts/validate-dependencies.sh` to detect violations automatically.

---

### 2. Event-Driven Validation

- [ ] New events registered in `packages/events/src/subjects.ts`
- [ ] All events carry: `eventId`, `version`, `occurredAt`, `correlationId`, `traceId`, `payload`
- [ ] `eventId` is a UUIDv4
- [ ] `version` is incremented for breaking schema changes
- [ ] Consumers are idempotent — deduplicate on `eventId` using Redis or DB unique index
- [ ] Failed messages route to `dlq.<original-subject>` after exhausting `max_deliver`
- [ ] New streams/consumers added to `infra/nats/jetstream-config.yaml` and `setup-streams.sh`
- [ ] New events documented in `docs/events.md`

---

### 3. API & Swagger Verification

- [ ] Every Fastify controller registers a complete `schema` block
- [ ] `tags`, `summary`, `description` present on every route
- [ ] `description` and `example` present on every property in `body`, `params`, `querystring`
- [ ] All response codes (2xx, 4xx, 5xx) are schema-validated
- [ ] Protected routes define `security: [{ BearerAuth: [] }]`
- [ ] Public routes (`/health`, `/ready`, `/metrics`, `/auth/*`, OAuth callbacks) explicitly omit `security`
- [ ] `/health`, `/ready`, `/metrics` endpoints exist on every service
- [ ] API Gateway static spec in `services/api-gateway/src/main.ts → openapi.paths` is synchronized
- [ ] Fastify plugins registered in order: helmet → cors → jwt → swagger → swagger-ui → routes

---

### 4. Code Quality & Security

- [ ] No `any` type usage — use `unknown` + type guards or Zod `.parse()`
- [ ] All exported functions and methods have explicit return types
- [ ] `import type` used for type-only imports
- [ ] Environment variables validated with Zod on startup; fail fast on missing/invalid
- [ ] `process.env` not read directly outside config module
- [ ] User inputs validated with Zod before reaching application use cases
- [ ] Social OAuth tokens encrypted with AES-256-GCM before DB storage
- [ ] JWT secrets ≥ 64 characters
- [ ] No secrets, passwords, or PII in log output
- [ ] No `.env` files with real credentials committed (only `.env.example`)
- [ ] Rate limiting registered on all gateway controllers

---

### 5. Observability

- [ ] Structured JSON logs via `@tik-live-pro/logger` (pino)
- [ ] `correlationId` and `traceId` propagated in all downstream HTTP headers and NATS event payloads
- [ ] Appropriate log levels used (`fatal`, `error`, `warn`, `info`, `debug`)
- [ ] OpenTelemetry SDK initialized before other imports in `main.ts`
- [ ] New service added to `infra/observability/prometheus.yml` (scrape job)
- [ ] New service has K8s liveness + readiness probes pointing to `/health` and `/ready`

---

### 6. Infrastructure

- [ ] New service has a Kubernetes Deployment + HPA manifest in `infra/kubernetes/`
- [ ] `replicas.min` is ≥ 2 for all production Deployments
- [ ] Service database added to `infra/docker/postgres/init.sql` (using idempotent `SELECT … \gexec`)
- [ ] Docker image uses `Dockerfile.service` with correct ARGs (no hardcoded service names)
- [ ] `dumb-init` is the entrypoint; container runs as non-root user
- [ ] New service entry added to `infra/docker/build.sh` SERVICES array and `docker-compose.prod.yml`
- [ ] NATS stream replicas: 3 (not 1) — durations in Go format (`168h` not `7d`)
- [ ] `bash .agents/scripts/validate-infra.sh` passes with no errors

---

### 7. Frontend (Web / Mobile)

- [ ] Feature code lives under `src/features/<feature>/` — no logic in page files
- [ ] No inline sub-components — every named component in its own file under `components/`
- [ ] No hardcoded user-facing strings — all text from `packages/i18n`
- [ ] Translation keys added symmetrically to both `en.json` and `fr.json`
- [ ] No global `hooks/` or `store/` folder — co-located with owning feature
- [ ] Web UI tested at 375 px, 768 px, and 1280 px viewports
- [ ] All API calls go through `src/lib/api.ts` → API Gateway (never direct service URL)
- [ ] Auth tokens never stored in `localStorage` — use NextAuth session cookies

---

### 8. Documentation

Per `.agents/rules/documentation.md`, verify that **all affected docs are updated**:

- [ ] `docs/architecture.md` — if service, port, or security model changed
- [ ] `docs/events.md` — if stream, consumer, or event schema changed
- [ ] `docs/setup.md` — if ports, env vars, or Make targets changed
- [ ] `docs/infra.md` — if Docker, Kubernetes, or secrets config changed
- [ ] `docs/observability.md` — if Prometheus, alerts, or OTel config changed
- [ ] `CLAUDE.md` — if overall project rules changed
- [ ] `docs/decisions/NNN-*.md` — if an architectural decision was made

---

### 9. Tests

- [ ] Unit tests for all new/changed domain use cases and value objects
- [ ] Integration tests for new platform adapters
- [ ] All tests pass: `pnpm test`
- [ ] No regressions in type checking: `pnpm typecheck`

---

## Automated Pre-Checks

Before manual review, run these commands and confirm they all pass:

```bash
# Clean Architecture dependency validation
bash .agents/scripts/validate-dependencies.sh

# Infrastructure coverage validation
bash .agents/scripts/validate-infra.sh

# Type checking
pnpm typecheck

# All tests
pnpm test
```
