# Skill: Review a Pull Request

Use when the user asks to review code changes.

## Review checklist

### Architecture
- [ ] Dependencies point inward: infrastructure → application → domain
- [ ] No platform-specific logic in core services (live-session, comments, stream-orchestrator)
- [ ] No cross-service DB queries — services own their data
- [ ] Use cases have single responsibility

### Events
- [ ] New events have versioned schemas in `packages/events/src/schemas/`
- [ ] Events carry `correlationId` and `traceId`
- [ ] Consumer is idempotent (handles duplicate delivery)
- [ ] Dead-letter handling is considered

### API Documentation (Swagger)
- [ ] Every new Fastify route has a `schema` block with `tags`, `summary`, and `response`
- [ ] Protected routes include `security: [{ BearerAuth: [] }]`
- [ ] Public routes do **not** have a `security` field
- [ ] All response status codes that can actually occur are documented
- [ ] `body`, `params`, and `querystring` schemas have `description` and `example` on each property
- [ ] New routes added to the **API Gateway static spec** in `services/api-gateway/src/main.ts`
- [ ] If a new platform was added, `enum` values for `platform` are updated in both service routes and the gateway spec

### Code quality
- [ ] No `any` types — use `unknown` and narrow with guards
- [ ] Explicit return types on all exported functions
- [ ] Env vars validated at startup via Zod
- [ ] Error handling uses domain error types

### Security
- [ ] No secrets hardcoded (check for API keys, tokens, passwords)
- [ ] User input validated with Zod before reaching use cases
- [ ] Platform OAuth tokens encrypted before storage
- [ ] Rate limiting in place on public endpoints
- [ ] New public routes (no Bearer required) are explicitly added to the gateway's `PUBLIC_PREFIXES` set
- [ ] Resource-scoped routes check ownership (`resource.userId === jwt sub`, 404 on mismatch) — `jwtVerify()` alone is not authorization
- [ ] User-supplied URLs reaching server-side fetch/ffmpeg pass the SSRF guard (no private/loopback hosts)
- [ ] New host ports in prod compose are loopback-bound (`127.0.0.1:`) unless the protocol requires direct public access

### Database
- [ ] Schema change ships with a migration SQL file **and** a `migrations/meta/_journal.json` entry (unjournaled = never applied)
- [ ] `onConflictDoUpdate` uses `` sql`excluded."col"` `` — table-column references are a silent no-op
- [ ] Hot lookup columns (FKs, status) have explicit indexes — Postgres does not auto-index FKs

### Streaming / concurrency (see CLAUDE.md — Streaming & Concurrency Rules)
- [ ] Spawned ffmpeg processes are registered and killed on session end + shutdown
- [ ] Late async callbacks re-read entity state from the DB before persisting transitions
- [ ] Socket.io room emits are bounded (payload caps, debounce, rate limits) — cost is O(viewers)
- [ ] Pollers: recursive setTimeout, in-flight guard, timeout on awaited calls, backoff, permanent stop after N failures

### Tests
- [ ] Domain use cases have unit tests
- [ ] New event schemas have contract tests
- [ ] UI flows have relevant tests

### i18n
- [ ] No hardcoded user-facing strings in UI components
- [ ] New translation keys added to both `en.json` and `fr.json`

### Observability
- [ ] Structured log statements at appropriate levels
- [ ] Correlation IDs propagated through the call chain
