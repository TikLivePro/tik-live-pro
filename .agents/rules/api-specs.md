# Rule: TikLivePro API Specifications

This rule governs routing schema validation, OpenAPI registration, security schemes, and API Gateway proxy synchronization.

> **Keep in sync with:** `CLAUDE.md` (API Documentation section) · `docs/setup.md` (API docs table)

---

## 1. Route Schema Requirements

Every Fastify HTTP route **MUST** register a `schema` block. Routes without schema definitions are disallowed.

### Minimum Required Schema Fields

| Field | Required | Notes |
|-------|---------|-------|
| `tags` | ✓ | Array with the feature group name; groups endpoints in Swagger sidebar |
| `summary` | ✓ | Concise one-line description of what the route does |
| `description` | ✓ | Full description: side effects, constraints, triggered NATS events |
| `response` | ✓ | Explicit schemas for all status codes (2xx, 4xx, 5xx) |
| `security` | Protected routes | `[{ BearerAuth: [] }]` for all JWT-protected routes |
| Property `description` + `example` | ✓ | Every property in `body`, `params`, `querystring` must have both |

### Example

```typescript
fastify.post('/sessions', {
  schema: {
    tags: ['Sessions'],
    summary: 'Create a live streaming session',
    description: `
Creates a new live session and emits \`session.created\` to NATS.
The stream-orchestrator consumes this event to provision RTMP endpoints.
    `.trim(),
    security: [{ BearerAuth: [] }],
    body: {
      type: 'object',
      required: ['title', 'destinationAccountIds'],
      additionalProperties: false,
      properties: {
        title: { type: 'string', description: 'Stream title', example: 'Morning Q&A' },
        destinationAccountIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Social account IDs to broadcast to',
          example: ['acc_123', 'acc_456'],
        },
      },
    },
    response: {
      201: { description: 'Session created.', type: 'object', properties: { /* ... */ } },
      401: { description: 'Unauthorized.', type: 'object', properties: { /* ... */ } },
      422: { description: 'Validation error.', type: 'object', properties: { /* ... */ } },
    },
  },
}, handler);
```

---

## 2. API Authentication (JWT Security)

- Register `@fastify/swagger` and `@fastify/swagger-ui` **before** any route declarations.
- **Protected routes**: add `security: [{ BearerAuth: [] }]` on every route that requires a valid JWT.
- **Public routes**: explicitly **omit** the `security` property (e.g. `/auth/login`, `/health`, `/ready`, OAuth callbacks).
- Do **not** register `BearerAuth` globally on the Swagger plugin — declare it per route so public routes remain clearly unprotected.

### Plugin registration order

```typescript
await fastify.register(fastifyHelmet);
await fastify.register(fastifyCors, ...);
await fastify.register(fastifyJwt, ...);
await fastify.register(fastifySwagger, { openapi: { ... } });   // ← before routes
await fastify.register(fastifySwaggerUi, { routePrefix: '/docs' }); // ← before routes
registerRoutes(fastify);   // ← after swagger
```

---

## 3. API Gateway Synchronization

- The API Gateway is a pure reverse proxy — it does **not** run Fastify schemas on proxied routes.
- Its Swagger is a **static OpenAPI spec** defined in `services/api-gateway/src/main.ts` under `openapi.paths`.
- The gateway at `http://localhost:3000/docs` is the **single external-facing API reference**.

**Critical Action**: whenever you add, rename, or modify a route in any service, you **must** also update the static spec in `services/api-gateway/src/main.ts → openapi.paths`.

---

## 4. Health and Readiness Endpoints

Every service **must** expose these two unprotected endpoints:

| Endpoint | HTTP status | Purpose |
|----------|------------|---------|
| `GET /health` | `200 { status: 'ok' }` | Kubernetes liveness probe |
| `GET /ready` | `200 { status: 'ready' }` | Kubernetes readiness probe — checks DB + NATS |
| `GET /metrics` | `200` (prom-client text) | Prometheus scrape |
| `GET /docs` | `200` (HTML) | Swagger UI |

These endpoints must **not** require `BearerAuth`.

---

## 5. RTMP / Non-HTTP Endpoints

The `stream-orchestrator` also listens on:
- **Port 1935** (RTMP) — used by OBS and other streaming clients.
- This port is not Fastify and has no Swagger spec; document protocol behavior in inline code comments and `docs/infra.md`.
