# Rule: TikLivePro API Specifications

This rule governs routing schema validation, OpenAPI registration, security schemes, and API Gateway proxies.

## 1. Route Schema Requirements

Every Fastify HTTP route **MUST** register a `schema` block. Routes without schema definitions are disallowed.

### Minimum Required Schema Fields
- `tags`: An array containing the feature group name (groups endpoints in the Swagger UI sidebar).
- `summary`: A concise, one-line summary of what the route does.
- `description`: A detailed description explaining side effects, constraints, and triggered domain events.
- `response`: Explicit response schemas mapping HTTP status codes (2xx, 4xx, 5xx) to object properties.
- Property-level metadata: Provide `description` and `example` for every property inside `body`, `params`, or `querystring` schemas.

---

## 2. API Authentication (JWT Security)

- Register `@fastify/swagger` and `@fastify/swagger-ui` before any route declarations.
- **Protected Routes**: Add the security property `security: [{ BearerAuth: [] }]` to enforce JWT token authorization.
- **Public Routes**: Explicitly omit the `security` property (e.g. `/auth/login`, health endpoints).
- Do not register the `BearerAuth` security scheme globally on the swagger plugins — declare it explicitly per route.

---

## 3. API Gateway Synchronization

- The API Gateway is a lightweight reverse proxy that forwards requests to underlying microservices.
- The gateway acts as the single external reference point at `http://localhost:3000/docs`.
- The gateway does not run Fastify validation schemas on proxy routes. Instead, it exposes a static OpenAPI spec.
- **Critical Action**: Whenever you add or modify a route in a service, you **must** update the static spec in `services/api-gateway/src/main.ts` under `openapi.paths` to stay in sync.
