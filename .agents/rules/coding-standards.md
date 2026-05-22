# Rule: TikLivePro Coding Standards

This rule establishes strict typing requirements, validation policies, error handling paradigms, and logging guidelines across the monorepo.

> **Keep in sync with:** `docs/architecture.md` (Security Model, Observability Stack)

---

## 1. Type Safety

- **No `any`**: strictly prohibited. Use `unknown` and narrow types with type guards, assertion signatures, or Zod `.parse()`.
- **Explicit returns**: all exported functions and methods must declare explicit return types.
- **Zod for inputs**: validate all incoming HTTP request bodies, parameters, and query strings with Zod schemas before reaching application use cases.
- **`import type`**: use `import type { Foo }` for type-only imports to comply with `isolatedModules`. Never import a type as a value.

---

## 2. Environment Validation

- Validate all environment variables at service startup.
- Use Zod schemas extending the baseline from `@tik-live-pro/config`.
- **Fail fast**: if a required variable is missing or invalid, log a `fatal`-level message and `process.exit(1)`. A service must never start in a degraded state.
- Never read `process.env` directly outside the config module — always import the validated config object.
- Document new env vars in both the service's `.env.example` and `docs/setup.md`.

---

## 3. Error Handling

- Avoid throwing generic `Error` objects.
- Use domain-specific error classes from `packages/domain` (e.g. `NotFoundError`, `UnauthorizedError`, `ConflictError`, `ValidationError`).
- Map domain errors to HTTP status codes in Fastify error handler middleware at the `interfaces/` layer.
- Never leak stack traces or internal error messages to HTTP responses — map to safe, user-facing messages.

---

## 4. Observability and Logging

- All logs must be structured JSON emitted via `@tik-live-pro/logger` (pino).
- Always propagate `correlationId` and `traceId` into:
  - Downstream HTTP request headers (`x-correlation-id`, `x-trace-id`)
  - NATS event payloads (`correlationId`, `traceId` fields)
  - Log context (child logger with `{ correlationId, traceId }`)

### Log levels

| Level | When to use |
|-------|------------|
| `fatal` | Unrecoverable crash or bootstrap failure; process exits |
| `error` | Unexpected exception requiring immediate developer attention |
| `warn` | Recoverable anomaly, degraded operation, or deprecated usage |
| `info` | Key lifecycle milestones: service started, session created, payment processed |
| `debug` | Detailed diagnostic flow: function entry/exit, DB queries, event payloads |

### Metrics and traces

- Every service must expose `GET /metrics` (Prometheus format via `prom-client`).
- Every service must expose `GET /health` (liveness) and `GET /ready` (readiness).
- Initialize the OpenTelemetry SDK before any other imports in `main.ts` (or a dedicated `telemetry.ts` file).
- Add the service to `infra/observability/prometheus.yml` when it is created.

---

## 5. NATS Idempotency

Every NATS consumer must deduplicate on `eventId`:
- Store processed `eventId` values in Redis (`SET eventId:${id} 1 EX ${ttl}`) or a DB unique index.
- TTL should equal or exceed the stream's `duplicate_window` (see `infra/nats/jetstream-config.yaml`).
- On duplicate detection, acknowledge the message and exit without re-processing.

---

## 6. Security

- JWT secrets must be ≥ 64 characters.
- Platform OAuth tokens must be AES-256-GCM encrypted before PostgreSQL storage using `TOKEN_ENCRYPTION_KEY`.
- Never log sensitive values: passwords, tokens, secrets, payment data, PII.
- Never commit `.env` files with real credentials — only `.env.example` is committed.
