# TikLivePro — Setup Guide

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 20.x LTS |
| pnpm | 9.x |
| Docker + Compose | 27.x |
| Git | 2.x |

## 1. Clone and install

```bash
git clone <repo-url> tik-live-pro
cd tik-live-pro
pnpm install
```

## 2. Start local infrastructure

```bash
pnpm docker:dev
```

This starts:
- **NATS JetStream** on `nats://localhost:4222` (monitoring: `http://localhost:8222`)
- **PostgreSQL 17** on `localhost:5432` (8 databases auto-created)
- **Redis 7** on `localhost:6379`
- **OpenTelemetry Collector** on ports `4317/4318`
- **Jaeger** UI on `http://localhost:16686`
- **Prometheus** on `http://localhost:9090`
- **Grafana** on `http://localhost:3001` (admin/admin)

## 3. Configure environment variables

Copy `.env.example` to `.env` in each service you want to run:

```bash
for svc in api-gateway auth users integrations live-session billing comments notifications analytics; do
  cp services/$svc/.env.example services/$svc/.env
done
cp apps/web/.env.example apps/web/.env
```

Update the values as needed (especially `JWT_SECRET` — must be ≥ 64 chars in production).

## 4. Run services in development

```bash
# All services and apps in parallel via Turborepo
pnpm dev

# Or individually
pnpm --filter @tik-live-pro/auth-service dev
pnpm --filter @tik-live-pro/web dev
```

Service ports (default):

| Service | Port |
|---------|------|
| API Gateway | 3000 |
| Auth Service | 3001 |
| User Service | 3002 |
| Live Session Service | 3003 |
| Billing Service | 3004 |
| Integrations Service | 3005 |
| Comments Service | 3006 |
| Notifications Service | 3007 |
| Analytics Service | 3008 |
| Web (Next.js) | 3009 |

## 5. Explore the API documentation

Once services are running, open any Swagger UI to explore and test the API interactively:

| Service | URL |
|---------|-----|
| **API Gateway** (recommended starting point) | http://localhost:3000/docs |
| Auth | http://localhost:3001/docs |
| Users | http://localhost:3002/docs |
| Live Session | http://localhost:3003/docs |
| Billing | http://localhost:3004/docs |
| Integrations | http://localhost:3005/docs |
| Comments | http://localhost:3006/docs |
| Notifications | http://localhost:3007/docs |
| Analytics | http://localhost:3008/docs |
| Stream Orchestrator | http://localhost:3009/docs |

**To authenticate in Swagger UI:**
1. Open http://localhost:3000/docs (the gateway has the full public API).
2. Expand `POST /auth/register` and create a test account.
3. Copy the `accessToken` from the response.
4. Click **Authorize** (lock icon, top right of the page).
5. Paste the token into the **BearerAuth** field and click **Authorize**.
6. All subsequent "Try it out" requests will include the `Authorization: Bearer` header.

## 7. Run tests

```bash
# All tests
pnpm test

# Specific package / service
pnpm --filter @tik-live-pro/billing-service test
pnpm --filter @tik-live-pro/domain test
```

## 8. Type checking

```bash
pnpm typecheck
```

## 9. NATS JetStream setup

Create streams and consumers after NATS is running:

```bash
# Install NATS CLI if needed
brew install nats-io/nats-tools/nats

# Create streams (parse config manually or use nats CLI)
nats stream add AUTH --subjects "auth.>" --retention limits --storage file
nats stream add SESSIONS --subjects "session.>" "stream.>" --retention limits --storage file
nats stream add COMMENTS --subjects "comment.>" --retention limits --storage file
nats stream add BILLING --subjects "billing.>" --retention limits --storage file
nats stream add DLQ --subjects "dlq.>" --retention limits --storage file
```

## 10. Mobile development

```bash
cd apps/mobile
pnpm dev
# Then press 'i' for iOS simulator or 'a' for Android emulator
```

Requires Expo Go app or simulator setup. See [Expo docs](https://docs.expo.dev/get-started/set-up-your-environment/).

## Production deployment

See `infra/kubernetes/` for K8s manifests and `infra/helm/` for Helm charts (to be created).

Secrets management: use Kubernetes Secrets or a dedicated secrets manager (Vault, AWS Secrets Manager). Never commit `.env` files with real credentials.

## Troubleshooting

**NATS connection refused**: Ensure `pnpm docker:dev` is running and healthy.
```bash
docker compose -f docker-compose.dev.yml ps
```

**DB migration errors**: Each service runs Drizzle migrations on startup. Check service logs:
```bash
pnpm --filter @tik-live-pro/auth-service dev 2>&1 | head -50
```

**Port conflicts**: Change the `PORT` in the service's `.env` file and update `api-gateway/.env` upstream URLs accordingly.
