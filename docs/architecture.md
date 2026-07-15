# TikLivePro — Architecture Overview

> **Last updated:** 2026-07-15 (added coturn — self-hosted TURN relay for WebRTC clients behind a NAT/firewall that STUN alone can't traverse; ephemeral HMAC credentials minted by stream-orchestrator, no long-lived secret shipped to the client) · 2026-07-06 (comments/WS hardening: platform comments persisted from comment.received; streamer socket events JWT-gated; OAuth auto-link backfills avatar/display name; auth_users gains avatar_url)
> Keep this file up-to-date whenever services, ports, infrastructure, or data flows change.

## Table of Contents

1. [System Components](#system-components)
2. [Service Catalogue](#service-catalogue)
3. [Infrastructure Components](#infrastructure-components)
4. [Data Flows](#data-flows)
5. [Clean Architecture per Service](#clean-architecture-per-service)
6. [Security Model](#security-model)
7. [Event Schema Versioning](#event-schema-versioning)
8. [Observability Stack](#observability-stack)
9. [Deployment Architecture](#deployment-architecture)

---

## System Components

```
                    ┌─────────────────────────────────────┐
                    │              Clients                 │
                    │   Next.js Web    │   React Native    │
                    └────────────────┬─────────────────────┘
                                     │ HTTPS / WSS
                    ┌────────────────▼─────────────────────┐
                    │            API Gateway               │
                    │   (BFF · JWT auth · Rate limiting)   │
                    │              Port 3000               │
                    └──┬──┬──┬──┬──┬──┬──┬──┬──┬──────────┘
                       │  │  │  │  │  │  │  │  │   HTTP (internal)
        ┌──────────────┘  │  │  │  │  │  │  │  └────────────────┐
        ▼                 ▼  │  │  ▼  │  ▼  ▼                   ▼
     Auth              Users │  │ Billing │ Comments         Notifications
    :3001              :3002 │  │  :3004 │  :3006               :3007
                             │  │        │
                        Integrations  Live Session
                           :3005       :3003
                             │              │
                             └──────┬───────┘
                                    │
                        ┌───────────▼──────────────┐
                        │      NATS JetStream       │
                        │        Event Bus          │
                        │  (3-node cluster, HA)     │
                        └───────────┬──────────────┘
                                    │
           ┌────────────────────────┼──────────────────┐
           ▼                        ▼                   ▼
    Stream Orchestrator         Analytics           Notifications
         :3009                   :3008               :3007 (worker)
           │
  ┌────────▼────────────────────────────┐
  │   Platform Adapters + MediaMTX     │
  │   TikTok  Facebook  (RTMP push)    │
  │   MediaMTX (HLS/WebRTC for viewers)│
  └────────────────────────────────────┘
```

---

## Service Catalogue

| Service | Port | Package name | Database | Key responsibilities |
|---------|------|-------------|----------|---------------------|
| api-gateway | 3000 | `@tik-live-pro/api-gateway` | — | JWT validation, rate limiting, HTTP proxy, Swagger aggregation |
| auth | 3001 | `@tik-live-pro/auth-service` | `tiklivepro_auth` | Registration, login, JWT issue/refresh, Google/Facebook/TikTok OAuth |
| users | 3002 | `@tik-live-pro/users-service` | `tiklivepro_users` | User profiles, preferences, CDN avatar management |
| live-session | 3003 | `@tik-live-pro/live-session-service` | `tiklivepro_sessions` | Session lifecycle (created → starting → live → ended) |
| billing | 3004 | `@tik-live-pro/billing-service` | `tiklivepro_billing` | Stripe subscriptions, entitlement enforcement |
| integrations | 3005 | `@tik-live-pro/integrations-service` | `tiklivepro_integrations` | Social account OAuth tokens, AES-256-GCM at-rest encryption |
| comments | 3006 | `@tik-live-pro/comments-service` | `tiklivepro_comments` | Platform comment polling, WebSocket fan-out |
| notifications | 3007 | `@tik-live-pro/notifications-service` | `tiklivepro_notifications` | Push and email notifications via NATS workqueue |
| analytics | 3008 | `@tik-live-pro/analytics-service` | `tiklivepro_analytics` | Event aggregation, usage metrics |
| stream-orchestrator | 3009 | `@tik-live-pro/stream-orchestrator` | `tiklivepro_stream` | RTMP ingestion (port 1935), multi-destination broadcast via TikTok/Facebook adapters and platform-native MediaMTX relay; per-session recording control via MediaMTX config API; `recordings` table persists completed segments after S3 upload; **video proxy** (`POST /video-proxy/resolve`) resolves YouTube/Twitch/Vimeo/Dailymotion URLs via yt-dlp subprocess — see `docs/video-proxy.md` |
| **status** | **3011** | `@tik-live-pro/status` | — | Public status page at https://status.tiklivepro.me — polls all service `/health` endpoints server-side and renders aggregated status |

---

## Infrastructure Components

| Component | Port(s) | Purpose |
|-----------|---------|---------|
| NATS JetStream | 4222 (client), 6222 (cluster), 8222 (monitoring) | Event bus — 3-node StatefulSet with `replicas: 3` on all streams |
| PostgreSQL 16 | 5432 | Primary datastore — one database per service |
| Redis 7 | 6379 | Session cache, rate-limiting counters, idempotency keys |
| MediaMTX | 1936 (RTMP in), 8888 (HLS out), 8889 (WebRTC HTTP), 8189/udp (WebRTC ICE), 9997 (REST API) | Platform-native streaming relay — Go binary, ~5 MB RAM. Receives RTMP relay from ffmpeg workers; serves HLS and WebRTC to browser viewers. Records streams to `/recordings` volume (fmp4, 1h segments). Open auth (`user: any`) in both dev and prod. Config: `infra/mediamtx/mediamtx.yml` (dev) / `mediamtx.prod.yml` (prod) |
| coturn | 3478/tcp, 3478/udp (TURN signalling), 49160-49200/udp (relayed media) | TURN relay for WebRTC (WHIP/WHEP) clients whose ICE connection can never complete via STUN alone — carrier-grade NAT, restrictive corporate/public wifi firewalls. Ephemeral (1h, HMAC-based) credentials are minted per-request by `stream-orchestrator` (`GET /sessions/:id/ingest`, `GET /ice-servers`) — no long-lived static credential ships to the client. Optional: without `TURN_SECRET` configured, WebRTC falls back to STUN-only. Config: `infra/coturn/turnserver.conf` |
| Object Storage | — (external) | Video recording archive. Option A: DigitalOcean Spaces (S3-compat, $5/mo, covered by $200 credit). Option B: Cloudflare R2 (10 GB/mo free, no egress fees). `RecordingUploader` in `stream-orchestrator` watches the `mediamtx_recordings` Docker volume and uploads completed `.fmp4` files. See `docs/recording.md`. |
| OTel Collector | 4317 (gRPC), 4318 (HTTP), 8888 (self-metrics), 8889 (prom export) | Receives OTLP traces/metrics/logs from all services; exports to Jaeger + Prometheus |
| Jaeger | 16686 (UI), 14268 (HTTP), 4317 (OTLP) | Distributed trace visualization |
| Prometheus | 9090 | Metrics scraping and alerting |
| Grafana | 3099 → 3000 | Dashboards (Prometheus + Jaeger datasources auto-provisioned) |

---

## Data Flows

### Starting a Live Stream

```
User → "Go Live" → API Gateway (JWT check)
  → Live Session Service: create session record (status: created)
  → NATS: publish session.created
  → Stream Orchestrator: consume session.created → register internal session

User → POST /sessions/:id/start
  → Live Session Service: status → starting
  → NATS: publish session.starting
  → Stream Orchestrator: consume session.starting (StartBroadcastUseCase)
      → always: add platform destination → MediaMTX rtmp://mediamtx:1936/live/{ingestKey}
      → if social accounts: fetch OAuth tokens → create TikTok/FB RTMP endpoints
      → NATS: publish stream.destination.status_changed (PENDING→CONNECTING)
      → session status → waiting_for_stream (ingestKey assigned)

User (OBS / ffmpeg / mobile) → RTMP :1935/live/{ingestKey}
  → stream-orchestrator receives stream (HandleStreamArrivedUseCase)
  → ffmpeg worker fans out to ALL connecting destinations in parallel:
      ├─ MediaMTX :1936/live/{ingestKey}  ← platform-native (always)
      ├─ TikTok RTMP endpoint             ← if account connected
      └─ Facebook RTMP endpoint           ← if account connected
  → first stats received → all destinations marked LIVE
  → NATS: publish session.live  { hlsUrl: "https://hls.tiklivepro.me/live/{ingestKey}/index.m3u8" }
  → Live Session Service: status → live, platformHlsUrl stored
  → Notifications Service: "You are live!" push notification
  → Analytics Service: record session start event

Viewers → https://hls.tiklivepro.me/live/{ingestKey}/index.m3u8  (HLS via Caddy, ~1 s latency)
         → https://hls.tiklivepro.me/live/{ingestKey}             (WebRTC, sub-second)
```

### Comment Aggregation

```
TikTok API ──poll──► TikTok Adapter ─┐
                                      ├─► Comments Service ──► NATS comment.received
Facebook API ──poll──► FB Adapter ───┘         │
                                               ▼
                               WebSocket fan-out → Browser/App
                               Analytics Service (persist + aggregate)
```

### Billing Entitlement Flow

```
User → Stripe checkout → Billing Service
  → NATS: publish billing.entitlement.updated
  → Users Service: update feature flags in DB
  → Integrations Service: enforce maxSocialAccounts
  → API Gateway: update cached entitlement (TTL 5 min)
```

---

## Clean Architecture per Service

```
src/
├── domain/           # Pure business rules — no I/O
│   ├── entities/
│   ├── value-objects/
│   ├── repositories/ # Interfaces only
│   └── services/     # Domain service interfaces
│
├── application/      # Orchestrates domain, no framework code
│   ├── use-cases/
│   └── ports/        # Interfaces for external systems (NATS, HTTP clients)
│
├── infrastructure/   # I/O adapters: DB, HTTP, NATS, encryption
│   ├── db/           # Drizzle ORM schemas + migrations
│   ├── repositories/ # Implements domain repository interfaces
│   └── clients/      # HTTP clients, NATS publisher
│
└── interfaces/       # Entry points: Fastify routes, WebSocket handlers
    └── http/
```

**Dependency rule**: dependencies point **inward only**.
`infrastructure` → `application` → `domain`. Domain depends on nothing external.

---

## Security Model

| Concern | Implementation |
|---------|---------------|
| Authentication | JWT access tokens (15 min TTL) + single-use refresh tokens (30 days, hashed in DB) |
| Platform token storage | AES-256-GCM encrypted before PostgreSQL insertion; `TOKEN_ENCRYPTION_KEY` ≥ 32 chars |
| Rate limiting | API Gateway: 500 req/min global, 100 req/min on `/auth/*` endpoints |
| Authorization | RBAC roles embedded in JWT; the Gateway verifies the JWT for admission (all protected prefixes). Downstream services that need the caller's identity (e.g. to scope a DB query to `userId`) must also call `await request.jwtVerify()` at the top of the route handler — the Gateway does not forward a decoded user header, it forwards the raw `Authorization: Bearer` header unchanged. |
| Resource ownership | Every session-scoped route in `stream-orchestrator` (ingest URL, recording start/stop/pause/resume/status, session recordings, video-push, recording download) compares `session.userId` against the JWT `sub` and answers **404** on mismatch (not 403, to avoid leaking existence). Without this, any authenticated user could read another host's ingest key and hijack their stream. |
| SSRF guards | `video-push` and `merge-stream` reject private/loopback hosts (`PRIVATE_IP_RE`); platform URLs are resolved via yt-dlp before reaching ffmpeg. |
| Streamer socket identity | The comments service Socket.io server verifies the JWT passed in the handshake `auth.token`. `join_as_streamer` requires a valid JWT and — when the session owner is known from `session.created`/`session.starting` events — the JWT `sub` must match the owner. `video_state` and `grant_video_control` are only accepted from the registered streamer socket. Clients supply the token via a socket.io `auth` **callback** so reconnects always carry a fresh (non-expired) access token. |
| OAuth account linking | `POST /auth/oauth/social` verifies the provider token server-side, then auto-links the OAuth identity to any existing account with the same (provider-attested) email. Missing profile data (avatar, display name) is backfilled from the provider on both register and login; user-chosen values are never overwritten. A provider attesting the account's email marks it verified. |
| Input validation | Zod schemas at the HTTP interface layer, before use-case invocation |
| Secret management | Kubernetes Secrets in production; never commit `.env` with real values |
| TLS | Ingress terminates TLS; all in-cluster traffic is plain HTTP |

---

## Event Schema Versioning

All events carry a `version: number` field. Rules:

- **Non-breaking additions** (new optional field): no version bump required.
- **Breaking changes** (rename, delete, type change): increment `version`.
- During migration, both producers and consumers must handle old and new versions.
- Old version is retired only after all consumers have been updated.

---

## Observability Stack

| Signal | Emission | Collection | Storage | Visualization |
|--------|----------|-----------|---------|---------------|
| Structured logs | `packages/logger` (pino) → stdout | Container runtime / k8s logs | — | `kubectl logs` / Loki (future) |
| Distributed traces | OTel SDK → OTLP :4317 | OTel Collector | Jaeger | Jaeger UI :16686 |
| Metrics | OTel SDK + prom-client → OTLP :4317 | OTel Collector → Prometheus :8889 | Prometheus :9090 | Grafana :3099 |
| Health | `GET /health` (liveness) | Kubernetes liveness probe | — | k8s pod status |
| Readiness | `GET /ready` (readiness) | Kubernetes readiness probe | — | k8s pod status |
| Alerts | Prometheus rules | `infra/observability/alerts/` | Alertmanager (future) | — |

Alert rules defined in `infra/observability/alerts/service-alerts.yml`:
- `ServiceDown` — critical, fires after 1 min
- `HighErrorRate` — warning, >5% 5xx over 5 min
- `HighLatencyP99` — warning, >2 s P99
- `NATSDown` — critical
- `NATSHighPendingMessages` — warning
- `HighMemoryUsage` / `HighCPUUsage` — warning
- `HighDBConnectionCount` / `DBDown` — warning / critical

---

## Deployment Architecture

### Development

```
Host machine (Node.js processes via Turborepo)
  ├── All 10 microservices run directly on host ports 3000–3009
  ├── Next.js web app on port 3010
  └── Status page (Next.js) on port 3011

Docker Compose (docker-compose.dev.yml)
  └── NATS, PostgreSQL, Redis, OTel Collector, Jaeger, Prometheus, Grafana
  └── MediaMTX (Go)  — RTMP :1936  HLS :8888  WebRTC HTTP :8889  ICE UDP :8189  API :9997
```

### Production (Kubernetes)

```
Namespace: tik-live-pro
├── Ingress (nginx) → api-gateway:3000, status:3011, grafana:3000, jaeger:16686, prometheus:9090
├── Deployments (HPA-managed)
│   ├── api-gateway        replicas: 2–15  cpu: 70%
│   ├── auth-service       replicas: 2–10  cpu: 70%
│   ├── users-service      replicas: 2–10  cpu: 70%
│   ├── live-session       replicas: 2–20  cpu: 60%  (high-traffic real-time)
│   ├── billing            replicas: 2–8
│   ├── integrations       replicas: 2–10
│   ├── comments           replicas: 2–15  cpu: 65%  (high-traffic)
│   ├── notifications      replicas: 2–10
│   ├── analytics          replicas: 2–10
│   └── stream-orchestrator replicas: 2–10 (+ NodePort 31935 for RTMP ingest)
├── StatefulSets
│   ├── nats (3 replicas, 10 Gi each)
│   └── postgres (1 replica, 20 Gi)
├── Deployments (single replica)
│   ├── status             replicas: 1  port: 3011  (status.tiklivepro.me — health check poller)
│   ├── mediamtx  — RTMP :1936 (internal)  HLS :8888 (public)  WebRTC HTTP :8889  ICE UDP :8189
│   ├── redis, otel-collector, jaeger, prometheus, grafana  (observability)
└── Secrets (one per service — never committed to git)
```

Image registry: `ghcr.io/tik-live-pro/<service-name>:latest`
Build: `bash infra/docker/build.sh all` or `make docker-images`
Deploy: `make k8s-apply` (applies manifests in dependency order)
