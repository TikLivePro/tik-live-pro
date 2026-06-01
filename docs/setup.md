# TikLivePro — Setup Guide

> **Last updated:** 2026-06-01 (MEDIAMTX_WEBRTC_URL + MEDIAMTX_API_URL added; MediaMtxStreamWatcher Basic-auth fix; webrtc.tiklivepro.me Caddy entry; remove NEXT_PUBLIC_STREAM_ORCHESTRATOR_URL — stream-orchestrator now proxied via Caddy at /stream-orchestrator/* on api.tiklivepro.me)
> Update this file whenever prerequisites, ports, environment variables, or workflow steps change.

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Node.js | 20.x LTS | https://nodejs.org |
| pnpm | 9.x | `npm i -g pnpm` |
| Docker + Compose | 27.x | https://docs.docker.com/get-docker |
| Git | 2.x | https://git-scm.com |
| nats CLI _(optional, for stream setup)_ | 0.1.4+ | https://github.com/nats-io/natscli/releases |

---

## 1. Clone and install

```bash
git clone <repo-url> tik-live-pro
cd tik-live-pro
pnpm install
```

---

## 2. Start local infrastructure

```bash
make infra-up
# or: docker compose -f docker-compose.dev.yml up -d
```

This starts:

| Service | URL / port | Credentials |
|---------|-----------|-------------|
| NATS JetStream | `nats://localhost:4222` · monitoring: http://localhost:8222 | — |
| PostgreSQL 16 | `localhost:5432` | user: `postgres`, password: `password` |
| Redis 7 | `localhost:6379` | — |
| Mailpit (SMTP catch-all) | SMTP: `localhost:1025` · UI: http://localhost:8025 | — |
| OTel Collector | gRPC: `localhost:4317` · HTTP: `localhost:4318` | — |
| Jaeger UI | http://localhost:16686 | — |
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3099 | admin / admin |
| MediaMTX (HLS/WebRTC relay) | RTMP: `localhost:1936` · HLS: http://localhost:8888 · WebRTC: http://localhost:8889 · API: http://localhost:9997 | — |

> **Email in development:** Mailpit traps all outbound SMTP traffic — nothing reaches a real inbox. To enable it for the auth service, set these in `services/auth/.env`:
> ```
> SMTP_PROVIDER=custom
> SMTP_HOST=localhost
> SMTP_PORT=1025
> SMTP_SECURE=false
> SMTP_USER=dev
> SMTP_PASS=dev
> SMTP_FROM=TikLive Pro <dev@tiklivepro.me>
> ```
> Then open http://localhost:8025 to see captured messages.

> **Linux note:** `host.docker.internal` is aliased to the Docker bridge gateway via `extra_hosts: host-gateway` in `docker-compose.dev.yml`, so Prometheus can scrape services running on the host without any manual config.

---

## 3. Create JetStream streams and consumers

Run once after infrastructure starts (requires `nats` CLI):

```bash
make nats-streams
# or: bash infra/nats/setup-streams.sh
```

This creates 9 streams (AUTH, USERS, SESSIONS, BILLING, INTEGRATIONS, COMMENTS, NOTIFICATIONS, ANALYTICS, DLQ) and all durable consumers. The script is idempotent — safe to re-run.

---

## 4. Configure environment variables

Copy `.env.example` to `.env` in each service:

```bash
for svc in api-gateway auth users integrations live-session stream-orchestrator \
            billing comments notifications analytics; do
  cp services/$svc/.env.example services/$svc/.env
done
cp apps/web/.env.example apps/web/.env
```

Update values as needed — critical variables:

| Variable | Service(s) | Notes |
|----------|-----------|-------|
| `JWT_SECRET` | all | Must be ≥ 64 chars; identical across all services |
| `DATABASE_URL` | all | Auto-created by init.sql on first `make infra-up` |
| `NATS_URL` | all | Default: `nats://localhost:4222` |
| `STRIPE_SECRET_KEY` | billing | Use `sk_test_…` for dev |
| `TIKTOK_CLIENT_KEY` / `SECRET` | integrations, stream-orchestrator, web | From TikTok Developer Portal |
| `FACEBOOK_APP_ID` / `SECRET` | integrations, stream-orchestrator, web | From Meta Developer Portal |
| `TOKEN_ENCRYPTION_KEY` | integrations | ≥ 32 chars, AES-256-GCM key |
| `NEXTAUTH_URL` | apps/web | Public URL of the web app, e.g. `https://tiklivepro.me` |
| `MEDIAMTX_RTMP_URL` | stream-orchestrator | Internal RTMP push URL for ffmpeg workers. Default: `rtmp://localhost:1936` (dev) · `rtmp://mediamtx:1936` (Docker/prod) |
| `MEDIAMTX_HLS_URL` | stream-orchestrator | **Public** HLS base URL returned to viewers. Default: `http://localhost:8888` (dev) · `https://hls.tiklivepro.me` (prod) |
| `MEDIAMTX_WEBRTC_URL` | stream-orchestrator | **Public** WebRTC/WHIP base URL the broadcaster's browser POSTs to. Default: `http://localhost:8889` (dev) · `https://webrtc.tiklivepro.me` (prod). Must be HTTPS in production for browser camera access. |
| `MEDIAMTX_API_URL` | stream-orchestrator | Internal MediaMTX REST API URL used by stream-orchestrator to detect live streams. Default: `http://localhost:9997` (dev) · **hardcoded** to `http://mediamtx:9997` in prod compose (do not override). |
| `MEDIAMTX_API_USER` | stream-orchestrator, mediamtx | Username for the MediaMTX REST API. **Leave blank in dev** (open auth). Required in prod. |
| `MEDIAMTX_API_PASS` | stream-orchestrator, mediamtx | Password for the MediaMTX REST API (≥ 32 chars recommended). **Leave blank in dev**. Required in prod. |
| `NEXTAUTH_SECRET` | apps/web | Generate: `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` / `SECRET` | apps/web | From Google Cloud Console → Credentials |
| `AUTH_SERVICE_INTERNAL_URL` | apps/web | Internal URL NextAuth uses to call the auth service |
| `NEXT_PUBLIC_API_URL` | apps/web | **Build-time** — public URL of the API gateway. See note below. |
| `NEXT_PUBLIC_COMMENTS_WS_URL` | apps/web | **Build-time** — base URL for the comments socket.io WebSocket. In prod: `https://api.tiklivepro.me` (Caddy routes `/socket.io/*` to the comments service). See note below. |
| `NEXT_PUBLIC_GIPHY_API_KEY` | apps/web | **Build-time** — optional; from developers.giphy.com |
| `SMTP_PROVIDER` | auth | `gmail` \| `sendgrid` \| `custom` (default: `gmail`) |
| `SMTP_USER` | auth | SMTP login. Leave blank to disable welcome emails. |
| `SMTP_PASS` | auth | SMTP password / app-password |
| `SMTP_FROM` | auth | Sender address, e.g. `TikLive Pro <noreply@tiklivepro.me>` |
| `SMTP_HOST` | auth | Required only when `SMTP_PROVIDER=custom` |
| `SMTP_PORT` | auth | Required only when `SMTP_PROVIDER=custom` |
| `SMTP_SECURE` | auth | `true`/`false` — only when `SMTP_PROVIDER=custom` |

> **`NEXT_PUBLIC_*` are baked at build time.** Next.js inlines these variables into the browser JS bundle during `next build`. Setting them only in the container's runtime environment has no effect on client-side code — only on SSR paths. For Docker and CI builds, pass them as build arguments (`--build-arg`). For local dev, they live in `apps/web/.env` as usual.
>
> **Mobile / LAN testing:** if you access the web app from a phone on the same Wi-Fi, `localhost` resolves to the phone itself, not your machine. Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_COMMENTS_WS_URL` to your machine's LAN IP (e.g. `http://192.168.1.x:3000` and `http://192.168.1.x:3006`) in `apps/web/.env`, then restart `pnpm dev`.

---

## 5. Run services in development

```bash
make dev              # all services + web (Turborepo, hot-reload)
make dev-services     # backend only (no web)
make dev-web          # web only (Next.js on port 3010 with Turbopack)
```

Service ports:

| Service | Port | Swagger docs |
|---------|------|-------------|
| API Gateway | 3000 | http://localhost:3000/docs |
| Auth | 3001 | http://localhost:3001/docs |
| Users | 3002 | http://localhost:3002/docs |
| Live Session | 3003 | http://localhost:3003/docs |
| Billing | 3004 | http://localhost:3004/docs |
| Integrations | 3005 | http://localhost:3005/docs |
| Comments | 3006 | http://localhost:3006/docs |
| Notifications | 3007 | http://localhost:3007/docs |
| Analytics | 3008 | http://localhost:3008/docs |
| Stream Orchestrator | 3009 | http://localhost:3009/docs |
| Web App (Next.js) | 3010 | http://localhost:3010 |

> **RTMP & HLS ports (Docker — `make infra-up`):**
> - `stream-orchestrator` ingest: `rtmp://localhost:1935/live/<ingestKey>` — push your video here (OBS, ffmpeg CLI, etc.)
> - MediaMTX RTMP relay: `rtmp://localhost:1936` — internal; ffmpeg workers push here automatically
> - MediaMTX HLS output: `http://localhost:8888/live/<ingestKey>/index.m3u8` — share with viewers or embed in a player
> - MediaMTX WebRTC output: `http://localhost:8889/live/<ingestKey>` — zero-latency browser preview

---

## 6. API documentation (Swagger)

Authenticate in Swagger UI:

1. Open http://localhost:3000/docs
2. `POST /auth/register` → create a test account
3. Copy `accessToken` from the response
4. Click **Authorize** (lock icon) → paste into **BearerAuth** → **Authorize**
5. All subsequent "Try it out" calls will include the JWT header

---

## 7. Run tests

```bash
make test                                          # all tests
make test-services                                 # backend services only
make test-packages                                 # shared packages only
make test-watch pkg=@tik-live-pro/auth-service     # watch mode for one package
```

---

## 8. Type checking

```bash
make typecheck                # everything
make typecheck-services       # backend only
make typecheck-web            # Next.js only
```

---

## 9. Database management

```bash
make db-generate    # generate migration SQL from schema.ts (no DB needed)
make db-migrate     # apply pending migrations to all service databases
make db-studio svc=auth  # open Drizzle Studio for the auth service
```

---

## 10. Mobile development

```bash
make dev-mobile     # start Metro bundler
make android        # launch on Android emulator / device
make ios            # launch on iOS simulator (macOS only)
```

Requires Expo Go or a configured simulator. See [Expo setup docs](https://docs.expo.dev/get-started/set-up-your-environment/).

---

## 11. Docker image builds

```bash
# Build a single service image
make docker-image svc=auth

# Build all 10 service images
make docker-images

# Build + push to registry
PUSH=1 make docker-images

# Build with a specific tag
make docker-images tag=1.2.3
```

Images are tagged as `ghcr.io/tik-live-pro/<package-name>:<tag>`.

---

## 12. Production compose (E2E testing)

Test the full stack using pre-built images locally:

```bash
# 1. Build web image with correct public URLs baked in
#    (NEXT_PUBLIC_* must be set BEFORE building — they are frozen into the bundle)
export NEXT_PUBLIC_API_URL=http://localhost:3000
export NEXT_PUBLIC_COMMENTS_WS_URL=http://localhost:3000
make docker-images   # builds all services + web with the above build args

# 2. Set required environment variables
export POSTGRES_PASSWORD=strongpassword
export JWT_SECRET=$(openssl rand -base64 64)
export NEXTAUTH_SECRET=$(openssl rand -base64 32)
export NEXTAUTH_URL=http://localhost:3010
export AUTH_SERVICE_INTERNAL_URL=http://auth:3001
export GRAFANA_PASSWORD=adminpass
export STRIPE_SECRET_KEY=sk_test_...
export TIKTOK_CLIENT_KEY=...
export TIKTOK_CLIENT_SECRET=...
export FACEBOOK_APP_ID=...
export FACEBOOK_APP_SECRET=...
export GOOGLE_CLIENT_ID=...
export GOOGLE_CLIENT_SECRET=...
export TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
export INTERNAL_API_KEY=$(openssl rand -hex 32)

# MediaMTX — public URLs returned to browsers
# HLS: viewers watch streams at this URL
# WebRTC: broadcaster's browser POSTs WHIP offers here — must be HTTPS in prod
export MEDIAMTX_HLS_URL=http://localhost:8888       # dev default; use https://hls.tiklivepro.me in prod
export MEDIAMTX_WEBRTC_URL=http://localhost:8889    # dev default; use https://webrtc.tiklivepro.me in prod

# SMTP (optional — skip to disable welcome emails)
export SMTP_PROVIDER=gmail
export SMTP_USER=you@gmail.com
export SMTP_PASS=your-app-password
export SMTP_FROM="TikLive Pro <noreply@tiklivepro.me>"

# Giphy (optional)
export NEXT_PUBLIC_GIPHY_API_KEY=...

# 3. Start
make prod-up

# 4. Check
make prod-ps

# 5. Tear down
make prod-down
```

---

## 13. Kubernetes deployment

```bash
# 1. Fill in secrets.yaml placeholders
#    echo -n "value" | base64 -w 0
cp infra/kubernetes/secrets.yaml infra/kubernetes/secrets.local.yaml
# edit secrets.local.yaml with real base64-encoded values

# 2. Apply secrets manually first
kubectl apply -f infra/kubernetes/secrets.local.yaml

# 3. Apply everything else in order
make k8s-apply

# 4. Create JetStream streams in the cluster
NATS_URL=nats://nats-service.tik-live-pro.svc.cluster.local:4222 \
  make nats-streams-prod

# 5. Check status
make k8s-status

# 6. Rolling restart after new image push
make k8s-rollout
```

> **Important:** `secrets.local.yaml` must be in `.gitignore`. Never commit real credentials.

---

## Troubleshooting

**NATS connection refused**
```bash
make infra-ps        # check container health
make nats-logs       # view NATS output
```

**JetStream stream not found**
```bash
make nats-streams    # re-run stream setup
nats stream ls       # verify streams exist
```

**DB migration errors** — each service runs Drizzle migrations on startup:
```bash
make logs-auth       # stream auth service output
```

**Port conflicts** — change `PORT` in the service's `.env` and update `api-gateway/.env` upstream URLs.

**Grafana shows no data** — confirm Prometheus is scraping:
```bash
open http://localhost:9090/targets   # all targets should be UP
```

**`host.docker.internal` not resolving (Linux)** — already handled via `extra_hosts: host-gateway` in `docker-compose.dev.yml`. If you removed it, re-add:
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

**HLS stream not loading in browser** — check that MediaMTX is running and receiving the relay:
```bash
make mediamtx-logs           # check for RTMP push from ffmpeg
make mediamtx-ps             # confirm container is up
curl http://localhost:9997/v3/paths/list  # list active stream paths (dev — no auth needed)
# In prod, include credentials:
# curl -u "$MEDIAMTX_API_USER:$MEDIAMTX_API_PASS" http://<server>:9997/v3/paths/list
```
If no paths appear, the stream hasn't arrived at MediaMTX yet. Common causes:
- **Browser streaming (WHIP):** check that `MEDIAMTX_WEBRTC_URL` is set to the public HTTPS URL in production and that `webrtc.tiklivepro.me` has a DNS A record. Open the browser console to check for WHIP POST errors.
- **OBS streaming:** confirm the OBS stream target is `rtmp://localhost:1935/live/<ingestKey>` and the stream-orchestrator RTMP server is up.
- **API auth:** in production, `MEDIAMTX_API_URL` must be `http://mediamtx:9997` (not localhost) and `MEDIAMTX_API_USER`/`MEDIAMTX_API_PASS` must be set — the watcher sends these as HTTP Basic Auth to authenticate with the MediaMTX REST API.

**Session stays in `starting` status** — the session transitions to `live` only after the `MediaMtxStreamWatcher` detects a live path on MediaMTX. Check:
1. A streaming client (browser WHIP or OBS) is actively pushing to the ingest endpoint.
2. In production: `MEDIAMTX_API_URL=http://mediamtx:9997` (the watcher must reach the mediamtx container, not its own localhost), and `MEDIAMTX_API_USER`/`MEDIAMTX_API_PASS` are set (the prod config requires Basic Auth on the REST API).
3. Retrieve the ingest URLs from `GET /stream/sessions/<id>/ingest` — the response includes `ingestUrl` (RTMP/OBS), `whipUrl` (browser), `hlsUrl` (viewer), and `status`.
