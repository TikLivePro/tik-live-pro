# Skill: Scaffold a New Microservice

This skill guides the scaffolding and bootstrap configuration of a new Fastify backend microservice within the TikLivePro monorepo.

---

## Preconditions / Trigger Criteria
Use this skill when:
- Creating a new microservice under `/services/<service-name>/`.
- Setting up the domain, application, infrastructure, and interfaces boundaries.

---

## Detailed Scaffolding Steps

### 1. Build Directory Structure
Create directories adhering to Clean Architecture inside `services/<service-name>/`:
```
services/<service-name>/
├── src/
│   ├── domain/
│   │   ├── entities/
│   │   ├── value-objects/
│   │   ├── repositories/      # Interfaces only
│   │   └── services/          # Domain services
│   ├── application/
│   │   ├── use-cases/
│   │   └── ports/             # External port interfaces
│   ├── infrastructure/
│   │   ├── db/
│   │   │   └── schema.ts
│   │   └── repositories/      # Implementations
│   └── interfaces/
│       └── http/
│           └── routes.ts      # Fastify controllers
├── tests/
├── .env.example
├── package.json
└── tsconfig.json
```

### 2. Configure package.json
Copy boilerplate config from an existing service (e.g. `services/users/package.json`). Ensure Fastify routing, cors, helmet, jwt, and Swagger dependencies are correct:
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

### 3. Build tsconfig.json
Extend workspace bases:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"]
}
```

### 4. Create bootstrap entry point (src/main.ts)
Implement initialization:
- Parse environment via Zod (`parseEnv` from `@tik-live-pro/config`).
- Configure logger (`createLogger` from `@tik-live-pro/logger`).
- Initialize NATS via `NatsJetStreamClient`.
- Register fastify plugins in order: **helmet → cors → jwt → swagger → swagger-ui → routes**.
- Register Swagger configuration **before** route mappings:
```typescript
await fastify.register(fastifySwagger, {
  openapi: {
    openapi: '3.1.0',
    info: { title: 'TikLivePro — <Service>', version: '1.0.0' },
    servers: [{ url: 'http://localhost:{port}' }],
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    }
  }
});
```
- Map liveness `/health` and readiness `/ready` routes.
- Listen and output Swagger reference logs.

### 5. Enforce Route Schema Specifications
Verify that every Fastify route contains valid validation:
```typescript
fastify.get('/resource/:id', {
  schema: {
    tags: ['FeatureGroup'],
    summary: 'Get a resource by ID',
    security: [{ BearerAuth: [] }],
    params: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', format: 'uuid' } }
    },
    response: {
      200: { type: 'object', properties: { data: { type: 'object' } } }
    }
  }
}, async (request, reply) => { /* usecase */ });
```

### 6. Update API Gateway Spec & DevOps
- Register proxy mappings under `openapi.paths` in `services/api-gateway/src/main.ts`.
- Set up DB migration schema files under `infrastructure/db/migrations/0000_initial.sql`.
- Map service ports in `docker-compose.dev.yml`.
- Add pipelines to `turbo.json`.
