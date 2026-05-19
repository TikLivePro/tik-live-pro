# TikLivePro — Architecture Overview

## System Components

```
                    ┌─────────────────────────────────┐
                    │         Clients                 │
                    │  Next.js Web  │  React Native   │
                    └──────────────┬──────────────────┘
                                   │ HTTPS / WSS
                    ┌──────────────▼──────────────────┐
                    │         API Gateway              │
                    │   (BFF · JWT auth · Rate limit)  │
                    └──┬───┬───┬───┬───┬───┬──────────┘
                       │   │   │   │   │   │  HTTP (internal)
          ┌────────────┘   │   │   │   │   └──────────────┐
          ▼                ▼   ▼   ▼   ▼                   ▼
       Auth            Users Integrations Billing     Comments
      Service          Svc    Svc         Svc          Svc (WS)
          │                │       │         │              │
          └────────────────┴───────┴─────────┴──────────────┘
                                    │
                        ┌───────────▼──────────────┐
                        │     NATS JetStream        │
                        │   Event Bus               │
                        └───────────┬──────────────┘
                                    │
             ┌──────────────────────┼───────────────────┐
             ▼                      ▼                    ▼
       Live Session          Stream Orchestrator    Analytics
         Service                  Service            Service
                                    │
                         ┌──────────▼──────────┐
                         │  Platform Adapters  │
                         │  TikTok  Facebook   │
                         └─────────────────────┘
```

## Supported Platforms

| Platform | OAuth | Live Stream | Comments |
|----------|-------|-------------|----------|
| TikTok | OAuth 2.0 PKCE | `/v2/live/stream/create/` | Polling |
| Facebook | OAuth 2.0 | Graph API Live Videos | Polling |

## Data Flow: Starting a Stream

1. User submits "Go Live" on the frontend.
2. API Gateway validates JWT, forwards to **Live Session Service**.
3. Live Session creates a session record, emits `session.created` to NATS.
4. **Stream Orchestrator** consumes `session.created`:
   - Fetches OAuth tokens from **Integrations Service**
   - Calls TikTok/Facebook adapters to create RTMP endpoints
   - Emits `stream.destination.status_changed` for each platform
5. Frontend streams via OBS/WebRTC to RTMP endpoints.
6. **Comment Poller** (in Comments Service) starts polling each platform's comment API.
7. New comments are published to `comment.received` on NATS.
8. Comments Service pushes via WebSocket to the connected client.

## Data Flow: Comment Aggregation

```
TikTok API ──poll──► TikTok Adapter ──►
                                        Comment Poller ──► NATS comment.received ──► WS ──► UI
Facebook API ──poll──► Facebook Adapter ──►
```

## Clean Architecture per Service

```
domain/          ← pure business rules, no I/O
  entities/
  value-objects/
  repositories/  ← interfaces
  services/      ← domain service interfaces

application/     ← orchestrates domain, no framework code
  use-cases/
  ports/         ← interfaces for external systems

infrastructure/  ← I/O: DB, HTTP, NATS, encryption
  db/
  repositories/  ← implements domain repository interfaces
  clients/

interfaces/      ← entry points: HTTP routes, WebSocket handlers
  http/
```

## Security Model

- **JWT** access tokens (15 min TTL) + refresh tokens (30 days, single-use, hashed in DB)
- **Platform tokens** encrypted at rest with AES-256-GCM before PostgreSQL storage
- **Rate limiting** at API Gateway: 500 req/min global, 100 req/min on auth endpoints
- **RBAC**: roles embedded in JWT; checked by API Gateway and service-level guards
- **Input validation**: Zod schemas at the HTTP interface layer, before use cases

## Event Schema Versioning

All events carry a `version` integer field. Breaking changes increment the version. Both producers and consumers must handle both the old and new version during the migration window before the old version is retired.

## Observability Stack

| Signal | Tool |
|--------|------|
| Structured logs | pino → stdout (collected by container runtime) |
| Distributed traces | OpenTelemetry SDK → OTLP collector → Jaeger |
| Metrics | OpenTelemetry SDK → OTLP collector → Prometheus → Grafana |
| Health | `GET /health` (liveness), `GET /ready` (readiness) |
