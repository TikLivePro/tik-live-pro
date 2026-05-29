# TikLivePro — Observability Guide

> **Last updated:** 2026-05-22
> Update when adding new alert rules, changing scrape targets, or adding Grafana dashboards.

## Table of Contents

1. [Overview](#overview)
2. [OpenTelemetry Collector](#opentelemetry-collector)
3. [Prometheus](#prometheus)
4. [Grafana](#grafana)
5. [Jaeger](#jaeger)
6. [Alert Rules](#alert-rules)
7. [Adding Observability to a New Service](#adding-observability-to-a-new-service)

---

## Overview

```
Services (all 10)
    │
    ├── OTLP/gRPC :4317 ──► OTel Collector ──► Jaeger :16686  (traces)
    │                           │
    │                           └──► Prometheus exporter :8889
    │                                    │
    │                           Prometheus :9090 ──► Grafana :3099
    │
    └── /metrics (prom-client) ──► Prometheus :9090  (direct scrape in dev)
```

Signal ownership:
- **Traces** — OTel SDK in each service → OTLP collector → Jaeger
- **Metrics** — OTel SDK + `prom-client` in each service → OTLP collector OR direct Prometheus scrape
- **Logs** — pino structured JSON → stdout → container runtime (Loki integration is future work)

---

## OpenTelemetry Collector

Config: `infra/observability/otel-collector-config.yaml`

### Receivers

| Receiver | Protocol | Port | Purpose |
|----------|---------|------|---------|
| `otlp` | gRPC | 4317 | Receive traces, metrics, logs from services |
| `otlp` | HTTP | 4318 | Alternative transport (browser SDK, curl) |
| `prometheus` | — | 8888 | Collector self-metrics |

### Processors (in order)

1. `memory_limiter` — hard cap 512 MiB, spike 128 MiB; must be first to prevent OOM
2. `resourcedetection` — auto-tags spans with host name, container ID, service name from env
3. `batch` — buffers up to 1000 items or 5 s before exporting (reduces network overhead)

### Exporters

| Exporter | Target | Protocol |
|---------|--------|---------|
| `otlp/jaeger` | `jaeger:4317` | OTLP/gRPC (Jaeger ≥ 1.35 natively) |
| `prometheus` | `:8889` | HTTP — scraped by Prometheus |
| `debug` | stdout | Development troubleshooting |

### Pipelines

| Pipeline | Receivers | Processors | Exporters |
|----------|-----------|-----------|---------|
| traces | otlp | memory_limiter, resourcedetection, batch | otlp/jaeger, debug |
| metrics | otlp, prometheus | memory_limiter, resourcedetection, batch | prometheus |
| logs | otlp | memory_limiter, resourcedetection, batch | debug |

### Environment variable override

| Variable | Default | Description |
|----------|---------|-------------|
| `JAEGER_ENDPOINT` | `jaeger:4317` | Override Jaeger OTLP endpoint |

---

## Prometheus

Config: `infra/observability/prometheus.yml`

### Global settings

| Setting | Value | Notes |
|---------|-------|-------|
| `scrape_interval` | 15 s | All jobs default |
| `evaluation_interval` | 15 s | Alert rule evaluation |
| `scrape_timeout` | 10 s | Per-target timeout |
| `external_labels.cluster` | `tik-live-pro` | Added to all time series |
| `external_labels.env` | `development` | Change to `production` in prod |

### Scrape jobs

| Job | Target | Metrics path | Notes |
|-----|--------|-------------|-------|
| `prometheus` | `localhost:9090` | `/metrics` | Self-monitoring |
| `otel-collector` | `otel-collector:8889` | `/metrics` | Aggregated service metrics |
| `nats` | `nats:8222` | `/varz` | NATS JSON varz; use prometheus-nats-exporter for full metrics |
| `api-gateway` | `host.docker.internal:3000` | `/metrics` | Dev: host bridge |
| `auth-service` | `host.docker.internal:3001` | `/metrics` | |
| `users-service` | `host.docker.internal:3002` | `/metrics` | |
| `live-session-service` | `host.docker.internal:3003` | `/metrics` | |
| `billing-service` | `host.docker.internal:3004` | `/metrics` | |
| `integrations-service` | `host.docker.internal:3005` | `/metrics` | |
| `comments-service` | `host.docker.internal:3006` | `/metrics` | |
| `notifications-service` | `host.docker.internal:3007` | `/metrics` | |
| `analytics-service` | `host.docker.internal:3008` | `/metrics` | |
| `stream-orchestrator` | `host.docker.internal:3009` | `/metrics` | |
| `node-exporter` | `node-exporter:9100` | `/metrics` | Optional — add to compose if needed |

> **Production:** In Kubernetes, Prometheus uses `kubernetes_sd` with pod annotations (`prometheus.io/scrape: "true"`) instead of static configs.

### Alert rules

Loaded from: `/etc/prometheus/alerts/*.yml` (mounted from `infra/observability/alerts/`)

---

## Grafana

URL (dev): http://localhost:3099 · Credentials: `admin / admin`

### Auto-provisioned datasources

Located in `infra/observability/grafana/provisioning/datasources/datasources.yaml`:

| Datasource | UID | URL | Default |
|-----------|-----|-----|---------|
| Prometheus | `prometheus` | `http://prometheus:9090` | ✓ |
| Jaeger | `jaeger` | `http://jaeger:16686` | — |

Datasources are provisioned on Grafana startup — no manual configuration needed.

### Trace-to-metrics linking

The Jaeger datasource is configured with `tracesToMetrics` pointing at the Prometheus datasource (uid: `prometheus`). This allows clicking a span in Jaeger and jumping directly to the related metrics in Grafana.

### Adding dashboards

Place dashboard JSON files in:
```
infra/observability/grafana/provisioning/dashboards/
```
And add a dashboard provisioning config:
```yaml
# infra/observability/grafana/provisioning/dashboards/dashboards.yaml
apiVersion: 1
providers:
  - name: TikLivePro
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards
```

Export from Grafana UI: **Dashboard → Share → Export → Save to file**

---

## Jaeger

URL (dev): http://localhost:16686

Jaeger receives OTLP traces from the OTel Collector (port 4317). Services do not connect to Jaeger directly.

**Searching traces:**
1. Select a service from the dropdown
2. Filter by operation, tags, or duration
3. Click a trace to view the full span tree with timing breakdown

**Cross-service traces:**
All services propagate W3C `traceparent` / `tracestate` headers. The `correlationId` is attached as a span attribute, enabling trace search by correlation ID.

---

## Alert Rules

File: `infra/observability/alerts/service-alerts.yml`

| Alert | Severity | Condition | Duration |
|-------|---------|-----------|---------|
| `ServiceDown` | critical | `up == 0` for any service job | 1 min |
| `HighErrorRate` | warning | >5% 5xx responses | 2 min |
| `HighLatencyP99` | warning | P99 latency >2 s | 3 min |
| `NATSDown` | critical | NATS monitoring unreachable | 1 min |
| `NATSHighPendingMessages` | warning | Stream message count >100 000 | 5 min |
| `HighMemoryUsage` | warning | Container >85% memory limit | 5 min |
| `HighCPUUsage` | warning | Container >90% CPU quota | 5 min |
| `HighDBConnectionCount` | warning | PostgreSQL connections >80 | 2 min |
| `DBDown` | critical | `pg_up == 0` | 1 min |

### Adding a new alert rule

1. Edit `infra/observability/alerts/service-alerts.yml`
2. Add your rule to an appropriate group (or create a new group)
3. Reload Prometheus without restart: `curl -X POST http://localhost:9090/-/reload`
4. Verify in Prometheus UI: **Status → Rules**
5. Update this document

---

## Adding Observability to a New Service

Every new service must implement:

### 1. `/health` endpoint (liveness)
```typescript
fastify.get('/health', async () => ({ status: 'ok' }));
```

### 2. `/ready` endpoint (readiness)
```typescript
fastify.get('/ready', async () => {
  // Check DB connection, NATS connection
  return { status: 'ready' };
});
```

### 3. `/metrics` endpoint (Prometheus)
```typescript
import client from 'prom-client';
client.collectDefaultMetrics();

fastify.get('/metrics', async (_, reply) => {
  reply.header('Content-Type', client.register.contentType);
  return client.register.metrics();
});
```

### 4. OpenTelemetry SDK initialization
```typescript
// src/telemetry.ts — initialize BEFORE any other imports
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

const sdk = new NodeSDK({
  serviceName: process.env.SERVICE_NAME ?? 'unknown-service',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317',
  }),
});
sdk.start();
```

### 5. Add Prometheus scrape job
Add to `infra/observability/prometheus.yml`:
```yaml
- job_name: my-new-service
  static_configs:
    - targets: [host.docker.internal:<PORT>]
      labels:
        service: my-new-service
  metrics_path: /metrics
```

### 6. Update docs
- Add the service row to the table in `docs/architecture.md` → Service Catalogue
- Add the service port to `docs/setup.md` → step 5
- If it publishes or consumes events, add them to `docs/events.md`
