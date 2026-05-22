# TikLivePro — Infrastructure Guide

> **Last updated:** 2026-05-22
> Update whenever a Dockerfile, compose file, Kubernetes manifest, or build script changes.

## Table of Contents

1. [Directory Structure](#directory-structure)
2. [Docker](#docker)
3. [Local Development Compose](#local-development-compose)
4. [Production Compose](#production-compose)
5. [Kubernetes](#kubernetes)
6. [Secrets Management](#secrets-management)

---

## Directory Structure

```
infra/
├── docker/
│   ├── Dockerfile.service              # Multi-stage template for all Node.js services
│   ├── Dockerfile.stream-orchestrator  # Extends template; adds ffmpeg for RTMP
│   ├── build.sh                        # Build helper — maps service → Docker ARGs
│   └── postgres/
│       └── init.sql                    # Creates all 9 service databases on first boot
├── kubernetes/
│   ├── namespace.yaml
│   ├── secrets.yaml                    # Template — fill & apply as secrets.local.yaml
│   ├── nats-deployment.yaml            # 3-node StatefulSet + headless service
│   ├── postgres-deployment.yaml        # StatefulSet + init ConfigMap
│   ├── redis-deployment.yaml
│   ├── api-gateway-deployment.yaml
│   ├── auth-deployment.yaml
│   ├── users-deployment.yaml
│   ├── live-session-deployment.yaml
│   ├── billing-deployment.yaml
│   ├── integrations-deployment.yaml
│   ├── comments-deployment.yaml
│   ├── notifications-deployment.yaml
│   ├── analytics-deployment.yaml
│   ├── stream-orchestrator-deployment.yaml  # Also exposes NodePort 31935 for RTMP
│   ├── observability.yaml              # OTel, Jaeger, Prometheus (RBAC), Grafana
│   └── ingress.yaml
├── nats/
│   ├── jetstream-config.yaml           # Stream + consumer definitions (reference)
│   └── setup-streams.sh               # Executable — applies config via nats CLI
└── observability/
    ├── otel-collector-config.yaml
    ├── prometheus.yml
    ├── alerts/
    │   └── service-alerts.yml
    └── grafana/
        └── provisioning/
            └── datasources/
                └── datasources.yaml
```

---

## Docker

### `Dockerfile.service` — multi-stage template

All Node.js services share a single parameterized Dockerfile. Stages:

| Stage | Base | Purpose |
|-------|------|---------|
| `base` | `node:22-alpine` | corepack + pnpm + dumb-init |
| `deps` | `base` | Install **production** deps for the target service + its workspace dependencies |
| `builder` | `base` | Copy full source, install all deps (including dev), run `pnpm build` |
| `runtime` | `node:22-alpine` | Minimal — copy `dist/` + `node_modules/` from builder; drop to non-root user |

**Build arguments:**

| ARG | Example | Description |
|-----|---------|-------------|
| `SERVICE_NAME` | `auth` | Service directory under `services/` |
| `PACKAGE_NAME` | `auth-service` | pnpm package name suffix (default: `${SERVICE_NAME}-service`) |
| `SERVICE_PORT` | `3001` | Port to EXPOSE and use in HEALTHCHECK |
| `NODE_VERSION` | `22` | Node.js Alpine image version |
| `PNPM_VERSION` | `9.15.0` | pnpm version to activate via corepack |

**Why `runtime` copies `node_modules` from `builder` (not `deps`)**:
Workspace packages are symlinked inside `node_modules`. The `deps` stage installs only prod deps, which creates the symlinks but doesn't build the `dist/` of the linked packages. The `builder` stage does build them, so copying `node_modules` from `builder` ensures workspace symlinks resolve to real compiled output.

### `Dockerfile.stream-orchestrator`

Extends the standard pattern but also installs `ffmpeg` in both `base` and `runtime` stages because `fluent-ffmpeg` shells out to the binary at runtime. Exposes:
- Port `3009` — HTTP API
- Port `1935` — RTMP ingest

### `build.sh` — helper script

```bash
# Single service
bash infra/docker/build.sh auth

# All services
bash infra/docker/build.sh all

# With custom tag
bash infra/docker/build.sh all 1.2.3

# With push to registry
PUSH=1 bash infra/docker/build.sh all 1.2.3

# With GitHub Actions cache
CACHE_FROM=type=gha bash infra/docker/build.sh auth
```

The script looks for `infra/docker/Dockerfile.${SERVICE_NAME}` first; falls back to `Dockerfile.service`.

**Makefile shortcuts:**
```bash
make docker-image svc=auth           # single service
make docker-images                   # all services
make docker-images tag=1.2.3 PUSH=1  # tag + push
```

### `.dockerignore`

Located at the repo root. Excludes:
- `node_modules/`, `dist/`, `.next/`, `.turbo/`
- `.env*` (except `.env.example`)
- Test files, coverage, editor files

---

## Local Development Compose

File: `docker-compose.dev.yml`

Runs infrastructure services only — microservices run directly on the host via Turborepo.

```bash
make infra-up       # start (detached)
make infra-down     # stop (keep volumes)
make infra-reset    # stop + delete all volumes (full wipe)
make infra-ps       # status
make infra-logs     # stream all logs
make db-logs        # Postgres only
make nats-logs      # NATS only
```

**Linux `host.docker.internal` fix:**
Prometheus needs to scrape microservices running on the host. On Docker Desktop this resolves automatically; on Linux we add:
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```
This aliases `host.docker.internal` to the Docker bridge gateway IP.

**Prometheus alert rules** are mounted from `infra/observability/alerts/` into the container so rules are loaded without rebuilding the image.

**Grafana datasources** are auto-provisioned from `infra/observability/grafana/provisioning/` — Prometheus and Jaeger are configured on first boot.

---

## Production Compose

File: `docker-compose.prod.yml`

Uses pre-built images from `ghcr.io/tik-live-pro/`. All 10 services plus full observability stack.

Features:
- YAML anchors (`x-service-defaults`, `x-backend-env`) for DRY configuration
- `:?` required variable guards — compose will refuse to start if a secret is missing
- `condition: service_healthy` on all `depends_on` blocks — services wait for infra to be ready
- `restart: unless-stopped` on all containers

```bash
# Start (requires env vars or .env.prod file)
IMAGE_TAG=1.2.3 make prod-up

# Monitor
make prod-ps
make prod-logs

# Stop
make prod-down
```

---

## Kubernetes

### Apply order (managed by `make k8s-apply`)

```
1. namespace.yaml
2. secrets.yaml          ← must apply secrets.local.yaml manually first
3. nats-deployment.yaml  (StatefulSet — 3 replicas)
4. postgres-deployment.yaml (StatefulSet — 1 replica + 20 Gi PVC)
5. redis-deployment.yaml
6. api-gateway, auth, users, live-session, billing,
   integrations, comments, notifications, analytics,
   stream-orchestrator
7. observability.yaml
8. ingress.yaml
```

### NATS StatefulSet

Three-replica StatefulSet for NATS clustering:
- Headless service (`nats-headless`) for stable pod DNS: `nats-0.nats-headless.tik-live-pro.svc.cluster.local`
- Client service (`nats-service`) for application connection: `nats-service.tik-live-pro.svc.cluster.local:4222`
- Prometheus exporter sidecar on port 7777

NATS_URL used by all services: `nats://nats-service.tik-live-pro.svc.cluster.local:4222`

### PostgreSQL StatefulSet

- Init ConfigMap runs `init.sql` on first boot — creates all 9 service databases
- 20 Gi PVC — adjust `storage` in the manifest for your cluster
- Connection strings follow pattern: `postgresql://postgres:<pass>@postgres:5432/tiklive_<service>`

### Stream Orchestrator — RTMP

The stream-orchestrator deployment has a secondary `NodePort` service exposing port **31935** for RTMP ingest. In cloud environments, create a TCP LoadBalancer service instead:

```yaml
# Replace NodePort with:
type: LoadBalancer
ports:
  - port: 1935
    targetPort: 1935
    protocol: TCP
    name: rtmp
```

### HPA Summary

| Deployment | Min | Max | Scale trigger |
|-----------|-----|-----|--------------|
| api-gateway | 2 | 15 | CPU 70% |
| auth-service | 2 | 10 | CPU 70% |
| live-session | 2 | 20 | CPU 60% (real-time traffic) |
| comments | 2 | 15 | CPU 65% |
| stream-orchestrator | 2 | 10 | CPU 70% |
| _others_ | 2 | 10 | CPU 70% |

### Ingress hostnames

Requires an NGINX Ingress Controller installed in the cluster.

| Hostname | Backend |
|---------|---------|
| `api.tiklive.pro` | api-gateway:3000 |
| `grafana.tiklive.pro` | grafana:3000 |
| `jaeger.tiklive.pro` | jaeger:16686 |
| `prometheus.tiklive.pro` | prometheus:9090 |

---

## Secrets Management

### Development

Each service reads from a local `.env` file (ignored by git). Use `.env.example` as the template.

### Production — Kubernetes

1. Copy the template: `cp infra/kubernetes/secrets.yaml infra/kubernetes/secrets.local.yaml`
2. Base64-encode each value: `echo -n "my-value" | base64 -w 0`
3. Fill in `secrets.local.yaml`
4. Apply manually (before `make k8s-apply`): `kubectl apply -f infra/kubernetes/secrets.local.yaml`
5. **Never commit `secrets.local.yaml`** — it is in `.gitignore`

### Production — Recommended (hardened)

For production workloads, replace Kubernetes Secrets with:
- **Sealed Secrets** (`kubeseal`) — encrypts secrets for safe git storage
- **External Secrets Operator** + AWS Secrets Manager / HashiCorp Vault
- **SOPS** with age/GPG encryption

These tools ensure secrets are never stored in plain text in the repository or cluster etcd.
