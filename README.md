# TikLivePro

> Multi-platform live streaming — broadcast simultaneously to TikTok, Facebook, and more.

## What it does

TikLivePro lets a creator:
- Start one live stream and broadcast it simultaneously to multiple social platforms
- See comments from all platforms aggregated in real time, in one feed
- Connect and manage TikTok and Facebook accounts
- Upgrade from freemium (2 accounts) to premium (unlimited accounts + advanced features)

## Tech stack

| Layer | Technology |
|-------|-----------|
| Web | Next.js 15, Tailwind CSS v4, Zustand, next-intl |
| Mobile | React Native (Expo), styled-components/native, Zustand |
| Backend | Fastify 5, TypeScript, Clean Architecture |
| API Docs | OpenAPI 3.1 (`@fastify/swagger` + `@fastify/swagger-ui`) |
| Event bus | NATS JetStream |
| Database | PostgreSQL 17 + Drizzle ORM |
| Cache | Redis 7 |
| Payments | Stripe |
| Observability | OpenTelemetry, Prometheus, Grafana, Jaeger |
| Infrastructure | Docker, Kubernetes, Helm |

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Start local infrastructure (NATS, Postgres, Redis, observability stack)
pnpm docker:dev

# 3. Copy environment files for every service
for svc in api-gateway auth users integrations live-session billing comments notifications analytics; do
  cp services/$svc/.env.example services/$svc/.env
done
cp apps/web/.env.example apps/web/.env

# 4. Start everything
pnpm dev
```

See [docs/setup.md](docs/setup.md) for the full setup guide including NATS stream creation, mobile setup, and troubleshooting.

## API documentation

Every service exposes an interactive **Swagger UI** at `/docs` (OpenAPI 3.1).
Start the services with `pnpm dev`, then open any of the URLs below.

| Service | Default URL | Description |
|---------|-------------|-------------|
| **API Gateway** | http://localhost:3000/docs | **Canonical external API** — all routes, auth scheme, shared schemas |
| Auth | http://localhost:3001/docs | Register, login, token refresh |
| Users | http://localhost:3002/docs | User profile management |
| Live Session | http://localhost:3003/docs | Session lifecycle (create → start → end) |
| Billing | http://localhost:3004/docs | Stripe subscriptions, entitlements |
| Integrations | http://localhost:3005/docs | TikTok / Facebook OAuth flow |
| Comments | http://localhost:3006/docs | Comment polling and WebSocket feed |
| Notifications | http://localhost:3007/docs | In-app notification management |
| Analytics | http://localhost:3008/docs | Session and account performance metrics |
| Stream Orchestrator | http://localhost:3009/docs | RTMP ingest endpoint, Prometheus metrics |

> **Tip:** the API Gateway Swagger at `:3000/docs` is the best starting point for client developers — it documents the full public API with shared component schemas and both production and staging server URLs.

### Authenticating in Swagger UI

1. Open any service's `/docs` page.
2. Click **Authorize** (lock icon, top right).
3. Register a user at `POST /auth/register` or log in at `POST /auth/login` (via the auth service docs or gateway docs).
4. Copy the `accessToken` from the response.
5. Paste it into the **BearerAuth** field in the Authorize dialog and click **Authorize**.
6. All subsequent requests in that tab will include the `Authorization: Bearer <token>` header automatically.

## Project structure

```
tik-live-pro/
├── apps/
│   ├── web/          # Next.js 15 + Tailwind CSS v4.3
│   └── mobile/       # React Native + Expo
├── services/
│   ├── api-gateway/          # BFF, JWT auth, rate limiting, proxy
│   ├── auth/                 # Registration, login, token lifecycle
│   ├── users/                # User profiles, avatar storage
│   ├── integrations/         # TikTok + Facebook OAuth
│   ├── live-session/         # Session lifecycle management
│   ├── stream-orchestrator/  # RTMP ingest + ffmpeg broadcast workers
│   ├── comments/             # Real-time comment aggregation
│   ├── billing/              # Stripe subscriptions, entitlements
│   ├── notifications/        # In-app notifications
│   └── analytics/            # Usage analytics, reporting
├── packages/
│   ├── shared-types/         # Shared TypeScript interfaces
│   ├── events/               # NATS subjects + event schemas
│   ├── logger/               # Structured pino logger
│   ├── config/               # Env validation via Zod
│   ├── validation/           # Shared Zod schemas
│   ├── i18n/                 # Translation keys (en, fr)
│   ├── domain/               # Value Objects, domain errors
│   └── platform-adapters/    # TikTok + Facebook adapter implementations
├── infra/
│   ├── docker/               # Service Dockerfiles
│   ├── kubernetes/           # K8s manifests
│   ├── helm/                 # Helm charts
│   ├── nats/                 # NATS JetStream configuration
│   └── observability/        # Prometheus, Grafana, OpenTelemetry
└── docs/
    ├── architecture.md
    ├── events.md
    ├── setup.md
    └── decisions/            # Architecture Decision Records
```

## Documentation

- [Architecture](docs/architecture.md)
- [Event contracts](docs/events.md)
- [Setup guide](docs/setup.md)
- [Architecture decisions](docs/decisions/)

## Adding a new platform

See `.claude/skills/add-platform.md` for the step-by-step checklist.

## License

Private — all rights reserved.
