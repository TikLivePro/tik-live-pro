# Skill: Scaffold a New Microservice

This skill guides the complete scaffolding and infrastructure wiring of a new Fastify backend microservice within the TikLivePro monorepo.

---

## Preconditions / Trigger Criteria

Use this skill when:
- Creating a new microservice under `/services/<service-name>/`.
- Setting up the domain, application, infrastructure, and interfaces boundaries.

---

## Detailed Scaffolding Steps

### 1. Assign a Port

Check the existing service catalogue (in `docs/architecture.md`) and pick the next available port. Current assignments:

| Port | Service |
|------|---------|
| 3000 | api-gateway |
| 3001 | auth |
| 3002 | users |
| 3003 | live-session |
| 3004 | billing |
| 3005 | integrations |
| 3006 | comments |
| 3007 | notifications |
| 3008 | analytics |
| 3009 | stream-orchestrator |

---

### 2. Build Directory Structure

Create directories adhering to Clean Architecture inside `services/<service-name>/`:

```
services/<service-name>/
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── repositories/      # Interfaces only
│   │   └── services/          # Domain service interfaces
│   ├── application/
│   │   ├── use-cases/
│   │   └── ports/             # External port interfaces (NATS, HTTP clients)
│   ├── infrastructure/
│   │   ├── db/
│   │   │   └── schema.ts      # Drizzle ORM schema
│   │   └── repositories/      # Concrete implementations
│   └── interfaces/
│       └── http/
│           └── routes.ts      # Fastify controllers
├── tests/
├── .env.example
├── package.json
├── tsconfig.json
└── drizzle.config.ts
```

---

### 3. Configure package.json

Use an existing service as a template (e.g. `services/users/package.json`). Required scripts and core dependencies:

```json
{
  "name": "@tik-live-pro/<service-name>-service",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc --project tsconfig.json",
    "start": "node dist/main.js",
    "test": "jest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@tik-live-pro/shared-types": "workspace:*",
    "@tik-live-pro/events": "workspace:*",
    "@tik-live-pro/logger": "workspace:*",
    "@tik-live-pro/config": "workspace:*",
    "@tik-live-pro/domain": "workspace:*",
    "fastify": "^5.1.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/helmet": "^12.0.0",
    "@fastify/jwt": "^9.0.0",
    "@fastify/swagger": "^9.0.0",
    "@fastify/swagger-ui": "^5.0.0",
    "drizzle-orm": "^0.38.0",
    "pg": "^8.13.0",
    "nats": "^2.28.0",
    "zod": "^3.23.0"
  }
}
```

---

### 4. Build tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

---

### 5. Create .env.example

Minimum required variables:
```env
# Server
PORT=<assigned-port>
NODE_ENV=development
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/tiklivepro_<service>

# NATS
NATS_URL=nats://localhost:4222

# Auth
JWT_SECRET=change-me-to-a-64-char-secret

# Tracing
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
CORRELATION_ID_HEADER=x-correlation-id
TRACE_ID_HEADER=x-trace-id
```

---

### 6. Create Bootstrap Entry Point (src/main.ts)

Implement initialization in this order:
1. Initialize OpenTelemetry SDK (before any other imports)
2. Parse environment via Zod (`parseEnv` from `@tik-live-pro/config`)
3. Create logger (`createLogger` from `@tik-live-pro/logger`)
4. Connect NATS (`NatsJetStreamClient`)
5. Register Fastify plugins: `helmet` → `cors` → `jwt` → `swagger` → `swagger-ui` → routes
6. Register `/health`, `/ready`, and `/metrics` endpoints
7. Start listening

```typescript
// Swagger registration BEFORE routes
await fastify.register(fastifySwagger, {
  openapi: {
    openapi: '3.1.0',
    info: { title: 'TikLivePro — <Service>', version: '1.0.0' },
    servers: [{ url: `http://localhost:${env.PORT}` }],
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    }
  }
});
await fastify.register(fastifySwaggerUi, { routePrefix: '/docs' });

// Health endpoints (no BearerAuth)
fastify.get('/health', async () => ({ status: 'ok' }));
fastify.get('/ready', async () => {
  // Check DB + NATS connection
  return { status: 'ready' };
});
// Prometheus metrics
fastify.get('/metrics', async (_, reply) => {
  reply.header('Content-Type', client.register.contentType);
  return client.register.metrics();
});
```

---

### 7. Enforce Route Schema Specifications

Every Fastify route must have a schema with `tags`, `summary`, `description`, `response`, and `description`+`example` on every property:

```typescript
fastify.get('/resource/:id', {
  schema: {
    tags: ['FeatureGroup'],
    summary: 'Get a resource by ID',
    description: 'Returns the resource. Emits analytics.resource.viewed to NATS.',
    security: [{ BearerAuth: [] }],
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Resource ID', example: 'abc-123' }
      }
    },
    response: {
      200: { type: 'object', properties: { data: { type: 'object' } } },
      401: { type: 'object', properties: { error: { type: 'object' } } },
      404: { type: 'object', properties: { error: { type: 'object' } } },
    }
  }
}, handler);
```

---

### 8. Add the Service Database

Add to `infra/docker/postgres/init.sql`:
```sql
SELECT 'CREATE DATABASE tiklivepro_<service>'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tiklivepro_<service>')\gexec
```

Also add to the PostgreSQL ConfigMap in `infra/kubernetes/postgres-deployment.yaml`.

---

### 9. Wire Infrastructure

- **Kubernetes**: create `infra/kubernetes/<service-name>-deployment.yaml` (copy an existing service as template, update name/port/image/DATABASE_URL/HPA)
- **Prometheus**: add a scrape job to `infra/observability/prometheus.yml`
- **docker-compose.dev.yml**: no change needed (microservices run on the host in dev)
- **docker-compose.prod.yml**: add service block with image, environment, depends_on
- **build.sh**: add entry to the `SERVICES` array in `infra/docker/build.sh`
- **Makefile**: add service to `SERVICES` filter list and `logs-<service>` target

---

### 10. Update API Gateway

Register proxy mappings under `openapi.paths` in `services/api-gateway/src/main.ts`.

---

### 11. Run the Infrastructure Validator

After wiring everything, run:
```bash
bash .agents/scripts/validate-infra.sh
```

Fix any failures reported before committing.

---

### 12. Documentation Updates

Per `.agents/rules/documentation.md`:

- [ ] `docs/architecture.md` — add row to **Service Catalogue** and **Deployment Architecture** tables
- [ ] `docs/setup.md` — add service to ports table (step 5)
- [ ] `docs/infra.md` — update K8s section if new StatefulSet or special service
- [ ] `docs/observability.md` — add service to Prometheus scrape jobs table
- [ ] `infra/nats/jetstream-config.yaml` — add consumers if service subscribes to NATS
- [ ] `docs/events.md` — add events if service publishes/consumes new NATS subjects
- [ ] `.agents/rules/architecture.md` — add row to Service Catalogue

---

### Verification Checklist

- [ ] Clean Architecture layers in place — dependency direction validated
- [ ] `.env.example` present and complete
- [ ] OpenTelemetry SDK initialized before other imports
- [ ] `/health`, `/ready`, `/metrics` endpoints exist
- [ ] All routes have complete schema blocks
- [ ] Database created in `infra/docker/postgres/init.sql`
- [ ] K8s Deployment + HPA manifest created
- [ ] Prometheus scrape job added
- [ ] `infra/docker/build.sh` SERVICES array updated
- [ ] `docker-compose.prod.yml` service block added
- [ ] API Gateway static spec updated
- [ ] `bash .agents/scripts/validate-infra.sh` passes
- [ ] Documentation updated (all items above)
