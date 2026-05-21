# Rule: TikLivePro Coding Standards

This rule establishes strict typing requirements, validation policies, error handling paradigms, and logging guidelines across the monorepo.

## 1. Type Safety

- **No `any`**: The use of `any` is strictly prohibited. Use `unknown` and narrow types using type guards, assertion signatures, or Zod parsing.
- **Explicit Returns**: All exported functions and methods must have explicit return types.
- **Zod for Inputs**: Validate all incoming user input (HTTP request bodies, parameters, and query strings) using Zod schemas before it reaches the application use cases.

---

## 2. Environment Validation

- Validate all environment variables at startup.
- Services must parse and validate env vars using Zod schemas extending the baseline configuration from `@tik-live-pro/config`.
- Fail fast: if a required environment variable is missing or invalid, the service must immediately log a fatal error and exit.

---

## 3. Error Handling

- Avoid throwing generic JavaScript `Error` objects.
- Use explicit, rich domain-specific error classes (e.g., `NotFoundError`, `UnauthorizedError`, `ConflictError`) extending domain primitives from `packages/domain`.
- Map domain errors to standard HTTP response codes in Fastify controller middleware (e.g. `NotFoundError` to `404 Not Found`).

---

## 4. Observability and Logging

- All logs must be structured JSON logs emitted via the `@tik-live-pro/logger` package (powered by `pino`).
- Always inject and propagate the `correlationId` and `traceId` context into downstream HTTP requests and NATS event payloads.
- Use appropriate log levels:
  - `fatal`: System crash or bootstrap failure.
  - `error`: Unexpected exceptions requiring developer attention.
  - `warn`: Recoverable anomalies or deprecated usage.
  - `info`: Key lifecycle milestones and operations.
  - `debug`: Detailed diagnostics for debugging.
