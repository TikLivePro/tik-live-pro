# TikLivePro — Architecture Overview

> **Last updated:** 2026-05-23
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
  ┌────────▼────────────┐
  │   Platform Adapters │
  │   TikTok  Facebook  │
  │   (RTMP push)       │
  └─────────────────────┘
```

---

## Service Catalogue

| Service | Port | Package name | Database | Key responsibilities |
|---------|------|-------------|----------|---------------------|
| api-gateway | 3000 | `@tik-live-pro/api-gateway` | — | JWT validation, rate limiting, HTTP proxy, Swagger aggregation |
| auth | 3001 | `@tik-live-pro/auth-service` | `tiklive_auth` | Registration, login, JWT issue/refresh, Google/Facebook/TikTok OAuth |
| users | 3002 | `@tik-live-pro/users-service` | `tiklive_users` | User profiles, preferences, CDN avatar management |
| live-session | 3003 | `@tik-live-pro/live-session-service` | `tiklive_sessions` | Session lifecycle (created → starting → live → ended) |
| billing | 3004 | `@tik-live-pro/billing-service` | `tiklive_billing` | Stripe subscriptions, entitlement enforcement |
| integrations | 3005 | `@tik-live-pro/integrations-service` | `tiklive_integrations` | Social account OAuth tokens, AES-256-GCM at-rest encryption |
| comments | 3006 | `@tik-live-pro/comments-service` | `tiklive_comments` | Platform comment polling, WebSocket fan-out |
| notifications | 3007 | `@tik-live-pro/notifications-service` | `tiklive_notifications` | Push and email notifications via NATS workqueue |
| analytics | 3008 | `@tik-live-pro/analytics-service` | `tiklive_analytics` | Event aggregation, usage metrics |
| stream-orchestrator | 3009 | `@tik-live-pro/stream-orchestrator` | `tiklive_stream` | RTMP ingestion (port 1935), multi-destination broadcast via TikTok/Facebook adapters |

---

## Infrastructure Components

| Component | Port(s) | Purpose |
|-----------|---------|---------|
| NATS JetStream | 4222 (client), 6222 (cluster), 8222 (monitoring) | Event bus — 3-node StatefulSet with `replicas: 3` on all streams |
| PostgreSQL 16 | 5432 | Primary datastore — one database per service |
| Redis 7 | 6379 | Session cache, rate-limiting counters, idempotency keys |
| OTel Collector | 4317 (gRPC), 4318 (HTTP), 8888 (self-metrics), 8889 (prom export) | Receives OTLP traces/metrics/logs from all services; exports to Jaeger + Prometheus |
| Jaeger | 16686 (UI), 14268 (HTTP), 4317 (OTLP) | Distributed trace visualization |
| Prometheus | 9090 | Metrics scraping and alerting |
| Grafana | 3001 → 3000 | Dashboards (Prometheus + Jaeger datasources auto-provisioned) |

---

## Data Flows

### Starting a Live Stream

```
User → "Go Live" → API Gateway (JWT check)
  → Live Session Service: create session record
  → NATS: publish session.created
  → Stream Orchestrator: consume session.created
      → Integrations Service: fetch OAuth tokens
      → Platform Adapters: create TikTok/FB RTMP endpoints
      → NATS: publish stream.destination.status_changed
  → Live Session Service: update destination statuses
  → User: OBS/WebRTC → RTMP :1935 → stream-orchestrator → platforms
  → NATS: publish session.started / session.live
  → Notifications Service: "You are live!" push notification
  → Analytics Service: record session start event
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
| Authorization | RBAC roles embedded in JWT; checked at Gateway and service level |
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
| Metrics | OTel SDK + prom-client → OTLP :4317 | OTel Collector → Prometheus :8889 | Prometheus :9090 | Grafana :3001 |
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
  └── Next.js web app on port 3010

Docker Compose (docker-compose.dev.yml)
  └── NATS, PostgreSQL, Redis, OTel Collector, Jaeger, Prometheus, Grafana
```

### Production (Kubernetes)

```
Namespace: tik-live-pro
├── Ingress (nginx) → api-gateway:3000, grafana:3000, jaeger:16686, prometheus:9090
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
│   └── stream-orchestrator replicas: 2–10 (+ NodePort 31935 for RTMP)
├── StatefulSets
│   ├── nats (3 replicas, 10 Gi each)
│   └── postgres (1 replica, 20 Gi)
├── Deployments (single replica — observability)
│   ├── redis, otel-collector, jaeger, prometheus, grafana
└── Secrets (one per service — never committed to git)
```

Image registry: `ghcr.io/tik-live-pro/<service-name>:latest`
Build: `bash infra/docker/build.sh all` or `make docker-images`
Deploy: `make k8s-apply` (applies manifests in dependency order)
