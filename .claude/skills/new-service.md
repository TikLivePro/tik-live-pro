# Skill: Scaffold a New Microservice

Use when adding a new backend service to the TikLivePro monorepo.

## Steps

### 1. Create directory structure
```
services/<service-name>/
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── repositories/      ← interfaces only
│   │   └── services/          ← domain service interfaces
│   ├── application/
│   │   ├── use-cases/
│   │   └── ports/             ← external port interfaces
│   ├── infrastructure/
│   │   ├── db/
│   │   │   └── schema.ts
│   │   └── repositories/      ← concrete implementations
│   └── interfaces/
│       └── http/
│           └── routes.ts
├── tests/
├── .env.example
├── package.json
└── tsconfig.json
```

### 2. Create package.json
Use an existing service as reference (e.g., `services/users/package.json`).
Always include these swagger dependencies:
```json
{
  "dependencies": {
    "fastify": "^5.1.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/helmet": "^12.0.0",
    "@fastify/jwt": "^9.0.0",
    "@fastify/swagger": "^9.0.0",
    "@fastify/swagger-ui": "^5.0.0"
  }
}
```

### 3. Create tsconfig.json
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"]
}
```

### 4. Create main.ts
Follow the pattern in `services/users/src/main.ts` or `services/auth/src/main.ts`:
- Parse env with `parseEnv` from `@tik-live-pro/config`
- Create logger with `createLogger` from `@tik-live-pro/logger`
- Connect to NATS via `NatsJetStreamClient`
- Register Fastify with: helmet → cors → jwt → **swagger** → **swagger-ui** → routes
- Register swagger **before** routes:

```typescript
await fastify.register(fastifySwagger, {
  openapi: {
    openapi: '3.1.0',
    info: { title: 'TikLivePro — <Service>', description: '...', version: '1.0.0' },
    servers: [{ url: 'http://localhost:{port}', variables: { port: { default: String(env.PORT) } } }],
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
          description: 'JWT access token from POST /auth/login.' },
      },
    },
    tags: [
      { name: '<FeatureGroup>', description: '...' },
      { name: 'Health', description: 'Kubernetes liveness / readiness probes.' },
    ],
  },
});

await fastify.register(fastifySwaggerUi, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'full', deepLinking: true, persistAuthorization: true,
    displayRequestDuration: true, filter: true },
  staticCSP: true,
});
```

- Add `/health` and `/ready` routes (with schema tags)
- Wire use cases to routes
- Graceful shutdown on SIGTERM/SIGINT
- Log `'listening — docs at /docs'` after `fastify.listen()`

### 5. Create routes.ts with full Swagger schemas
Every route must have a `schema` block. Minimum required fields:

```typescript
fastify.get('/resource/:id', {
  schema: {
    tags: ['FeatureGroup'],
    summary: 'Get a resource by ID',
    description: 'Longer description with side effects, constraints, and related events.',
    security: [{ BearerAuth: [] }],   // omit only for public routes
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Resource ID.', example: 'abc-123' },
      },
    },
    response: {
      200: { description: 'Resource found.', type: 'object', properties: { data: { /* ... */ } } },
      401: { description: 'Unauthorized.', type: 'object',
        properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      404: { description: 'Not found.', type: 'object',
        properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
    },
  },
}, async (request, reply) => { /* handler */ });
```

### 6. Update the API Gateway static spec
Add all new routes to the `openapi.paths` object in `services/api-gateway/src/main.ts`.
The gateway is the canonical external-facing API reference — it must stay in sync.

### 7. Add NATS subjects if needed
File: `packages/events/src/subjects.ts`
Add domain-specific subjects.

### 8. Add DB migration
Create: `services/<service-name>/src/infrastructure/db/migrations/0000_initial.sql`
**and** register it in `migrations/meta/_journal.json` (drizzle skips unjournaled files).
Add a `db:migrate` script (`tsx src/migrate.ts` — copy `services/auth/src/migrate.ts`, it is Neon-aware),
then add the service to the CI `migrate` job in `.github/workflows/deploy.yml` with its
`*_DATABASE_URL` secret. Migrations do NOT run at container startup.

### 9. Add to docker-compose.dev.yml AND the prod compose files
Add a service entry pointing to its Docker image or build context.
In `docker-compose.prod.managed.yml` / `docker-compose.prod.yml`, bind the host port
to loopback (`127.0.0.1:<port>:<port>`) — Caddy proxies via localhost; only RTMP 1935
and ICE 8189/udp are public. Add a memory limit and update the RAM budget table in
`docs/deploy-github-student.md`.

### 10. Add to turbo.json if the service has a non-standard pipeline.

### 11. Add to the CI build matrix
Add the service to the `build-services` matrix in `.github/workflows/deploy.yml`.

## Rules
- Keep dependencies pointing inward: infrastructure → application → domain
- No cross-service imports — use events or HTTP calls
- All external API calls in infrastructure layer
- Validate env at startup — fail fast
- **Every route must have a Swagger schema** — no schema-less routes committed
- Protected routes must include `security: [{ BearerAuth: [] }]`
- Resource-scoped routes must also check ownership (`resource.userId === jwt sub`, 404 on mismatch) — see CLAUDE.md Security Notes
- `Fastify({ trustProxy: true })` — services sit behind Caddy/the gateway; per-IP logic breaks without it
