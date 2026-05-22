# Rule: TikLivePro Infrastructure Guidelines

This rule governs Docker image builds, Kubernetes manifests, NATS JetStream configuration, observability setup, and secrets management.

> **Keep in sync with:** `docs/infra.md` · `docs/observability.md` · `docs/setup.md`

---

## 1. Docker Images

### Template (`infra/docker/Dockerfile.service`)

All Node.js services use the shared multi-stage Dockerfile template. Pass the following build arguments:

| ARG | Required | Example |
|-----|---------|---------|
| `SERVICE_NAME` | ✓ | `auth` |
| `PACKAGE_NAME` | ✓ | `auth-service` |
| `SERVICE_PORT` | ✓ | `3001` |
| `NODE_VERSION` | — | `22` (default) |
| `PNPM_VERSION` | — | `9.15.0` (default) |

**Never hard-code** `SERVICE_NAME` directly in the Dockerfile — always pass it as a build arg.

### Dedicated Dockerfiles

Services with special runtime requirements get their own Dockerfile at `infra/docker/Dockerfile.<service-name>`.

| Service | Special requirement |
|---------|-------------------|
| `stream-orchestrator` | `ffmpeg` installed in **both** build and runtime stages (fluent-ffmpeg shells out to the binary) |

The `build.sh` script automatically selects the dedicated Dockerfile when present.

### Build script

```bash
# Single service
bash infra/docker/build.sh <service-name>

# All services
bash infra/docker/build.sh all

# With push
PUSH=1 bash infra/docker/build.sh all 1.2.3
```

### Rules

- Always include `dumb-init` as the `ENTRYPOINT` for proper PID-1 signal handling (graceful shutdown).
- Run the container as a **non-root user** (`nodeuser:nodejs`, UID/GID 1001).
- HEALTHCHECK must use `wget -qO- http://localhost:${SERVICE_PORT}/health`.
- The `runtime` stage must copy `node_modules` from the `builder` stage (not `deps`) to preserve workspace symlinks to compiled package `dist/`.
- The `.dockerignore` at the repo root must always exclude: `node_modules/`, `dist/`, `.env*` (except `.env.example`), `coverage/`, `*.log`.

---

## 2. Kubernetes Manifests (`infra/kubernetes/`)

### Apply order

Always apply in dependency order (managed by `make k8s-apply`):
```
namespace → secrets → nats → postgres → redis
→ (microservices) → observability → ingress
```

### StatefulSets

- **NATS**: 3-replica StatefulSet with a headless service (`nats-headless`) for cluster DNS.
  - `NATS_URL` used by services: `nats://nats-service.tik-live-pro.svc.cluster.local:4222`
  - Prometheus sidecar exports metrics on port 7777.
- **PostgreSQL**: 1-replica StatefulSet with a ConfigMap-mounted `init.sql` that creates all service databases.
  - Adding a new service: add `CREATE DATABASE tiklive_<service>` to `infra/docker/postgres/init.sql` **and** the Kubernetes PostgreSQL ConfigMap in `postgres-deployment.yaml`.

### Deployments

Every microservice Deployment must include:
- `imagePullPolicy: Always` (production images are rebuilt on each push)
- Standard env vars via `secretKeyRef` / `configMapKeyRef`: `NODE_ENV`, `PORT`, `LOG_LEVEL`, `NATS_URL`, `DATABASE_URL`, `JWT_SECRET`
- Liveness probe: `GET /health`, `initialDelaySeconds: 10`, `failureThreshold: 3`
- Readiness probe: `GET /ready`, `initialDelaySeconds: 15`
- Resource requests and limits (match the service's HPA thresholds)
- A corresponding HPA with `minReplicas: 2` (never single-replica in production)

### Secrets

- `infra/kubernetes/secrets.yaml` is a **template** — contains placeholder values only. It is safe to commit.
- Real values go in `infra/kubernetes/secrets.local.yaml` — **never commit this file**.
- Base64-encode values: `echo -n "value" | base64 -w 0`
- For production hardening, migrate to Sealed Secrets or External Secrets Operator.

### RTMP (stream-orchestrator)

The stream-orchestrator has a secondary `NodePort` service on port **31935** for RTMP ingest. For cloud deployments, replace `NodePort` with a TCP `LoadBalancer` service.

---

## 3. NATS JetStream Configuration

Config reference: `infra/nats/jetstream-config.yaml`
Setup script: `infra/nats/setup-streams.sh` (idempotent — safe to re-run)

### Rules

- All streams must use `replicas: 3` to match the 3-node NATS cluster.
- Duration format: use Go duration strings (`168h`, `720h`, `8760h`) — not `7d`, `30d`, `365d`.
- Every stream must define a `duplicate_window` to prevent publisher-side duplicates.
- Message size: set `max_msg_size` appropriate to the subject (comments: 64 KiB, analytics: 32 KiB).
- Durable consumers must be pre-created by running `make nats-streams` after infrastructure starts.
- **Never create streams or consumers ad hoc** in service code — define them in `jetstream-config.yaml` and `setup-streams.sh`.

### Apply streams

```bash
# Development
make nats-streams

# Production
NATS_URL=nats://nats-service.tik-live-pro.svc.cluster.local:4222 make nats-streams-prod
```

---

## 4. Observability Configuration

### OTel Collector (`infra/observability/otel-collector-config.yaml`)

- Processor order: `memory_limiter` **must** come first (before `batch`) to prevent OOM.
- Use the `debug` exporter — the `logging` exporter is deprecated.
- The `resourcedetection` processor must be configured with `[env, docker, system]` to auto-tag spans.
- All three pipelines (traces, metrics, logs) must be declared.

### Prometheus (`infra/observability/prometheus.yml`)

- Every service must have a scrape job entry.
- On Linux dev, `host.docker.internal` is aliased via `extra_hosts: host-gateway` in `docker-compose.dev.yml` — do not change this.
- NATS metrics path is `/varz`, not `/metrics`.
- External labels must declare `cluster: tik-live-pro` and `env: development|production`.

### Alert rules (`infra/observability/alerts/`)

- Alert rules are loaded from all `*.yml` files in this directory.
- Every new alert must include `severity` label (`critical` or `warning`) and `runbook` annotation URL.
- Reload Prometheus after editing rules: `curl -X POST http://localhost:9090/-/reload`

### Grafana provisioning

- Datasources are auto-provisioned from `infra/observability/grafana/provisioning/datasources/datasources.yaml`.
- Dashboard JSON files should be placed in `infra/observability/grafana/provisioning/dashboards/` and referenced by a provider config file.
- Grafana credentials for dev: `admin / admin` (set via `GF_SECURITY_ADMIN_PASSWORD`).
