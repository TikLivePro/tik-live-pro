# TikLivePro — Infrastructure Guide

> **Last updated:** 2026-07-06 (hardening: internal ports bound to 127.0.0.1 in both prod compose files — only RTMP 1935 and ICE 8189/udp stay public; Caddy blocks /stream-orchestrator/docs and /metrics; CI now runs drizzle migrations for all 9 services before every deploy)
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
├── caddy/
│   └── Caddyfile                       # Caddy reverse proxy — tiklivepro.me, api., hls., webrtc. subdomains
├── mediamtx/
│   └── mediamtx.yml                    # MediaMTX config — RTMP :1936, HLS :8888, WebRTC :8889
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
│   ├── web-deployment.yaml             # Next.js frontend + ConfigMap + HPA
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
| `builder` | `base` | Copy full source, install all workspace deps (including dev), run `pnpm build` |
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

**Why `builder` installs workspace-wide dev deps (no service filter)**:
Some workspace dependency packages (for example shared libraries built with `tsc`) need their own dev-time build tools available during recursive builds. Installing dev dependencies across the workspace in `builder` avoids `tsc: not found` failures in CI at the cost of a heavier build layer.

### `Dockerfile.stream-orchestrator`

Extends the standard pattern but also installs `ffmpeg` in both `base` and `runtime` stages because `fluent-ffmpeg` shells out to the binary at runtime. Exposes:
- Port `3009` — HTTP API
- Port `1935` — RTMP ingest

### `Dockerfile.web` — Next.js standalone

Three-stage build producing a minimal standalone Next.js image.

**`NEXT_PUBLIC_*` build arguments** — these variables are inlined into the browser JS bundle by `next build`. They **must** be provided as `--build-arg` at image build time; setting them as Docker runtime env vars only affects SSR paths, not client-side code.

| ARG | Default | Description |
|-----|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://api.tiklivepro.me` | Public API gateway URL |
| `NEXT_PUBLIC_COMMENTS_WS_URL` | `https://api.tiklivepro.me` | Base URL for the comments WebSocket |
| `NEXT_PUBLIC_GIPHY_API_KEY` | _(empty)_ | Optional Giphy embed key |

```bash
# Build with custom public URLs
docker build \
  -f infra/docker/Dockerfile.web \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_COMMENTS_WS_URL=https://api.example.com \
  -t ghcr.io/tik-live-pro/web:latest \
  .
```

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

# Web with custom public URLs (NEXT_PUBLIC_* baked into the bundle)
NEXT_PUBLIC_API_URL=https://api.example.com \
NEXT_PUBLIC_COMMENTS_WS_URL=https://api.example.com \
bash infra/docker/build.sh web
```

The script looks for `infra/docker/Dockerfile.${SERVICE_NAME}` first; falls back to `Dockerfile.service`. For `web`, it reads `NEXT_PUBLIC_*` from the environment and forwards them as `--build-arg`.

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
make infra-up         # start (detached)
make infra-down       # stop (keep volumes)
make infra-reset      # stop + delete all volumes (full wipe)
make infra-ps         # status
make infra-logs       # stream all logs
make db-logs          # Postgres only
make nats-logs        # NATS only
make mediamtx-logs    # MediaMTX relay only
make mediamtx-ps      # MediaMTX container status
```

### MediaMTX — platform-native streaming relay

`docker-compose.dev.yml` includes MediaMTX (`bluenviron/mediamtx:latest`), a Go binary relay that requires ~5 MB RAM at idle and near-zero CPU (pure stream relay, no transcoding).

| Port | Role |
|------|------|
| **1936** (RTMP in) | ffmpeg workers inside stream-orchestrator push here |
| **8888** (HLS out) | Browser viewers watch `http://localhost:8888/live/{ingestKey}/index.m3u8` |
| **8889** (WebRTC HTTP) | WHIP signalling — browser POSTs SDP offer here to start streaming |
| **8189/udp** (WebRTC ICE) | ICE media transport — fixed UDP mux port so Docker port mapping works |
| **9997** (REST API) | `GET /v3/paths/list` to inspect active streams |

Config files:
- **Dev:** `infra/mediamtx/mediamtx.yml` — open auth (`user: any`, no password). Any credentials accepted.
- **Prod:** `infra/mediamtx/mediamtx.prod.yml` — also open auth (`user: any`). MediaMTX does not interpolate `$VAR` references in `user:` / `pass:` config fields, so named credentials cannot be passed via environment variables. Session security is enforced at the application layer: only the authenticated session owner knows their UUID `ingestKey`. Ports 9997 and 1936 are not externally exposed.

Environment variables wired in stream-orchestrator (`.env`):
```
MEDIAMTX_RTMP_URL=rtmp://localhost:1936   # internal — ffmpeg workers push here (container: rtmp://mediamtx:1936)
MEDIAMTX_HLS_URL=http://localhost:8888    # public — HLS URL returned to viewers
MEDIAMTX_WEBRTC_URL=http://localhost:8889 # public — WHIP base URL; returned by the ingest API to the browser
MEDIAMTX_API_URL=http://localhost:9997    # internal REST API (container: http://mediamtx:9997)
```

In production `MEDIAMTX_API_URL` must point at the mediamtx container (`http://mediamtx:9997`), not localhost. `MEDIAMTX_WEBRTC_URL` must be the **public HTTPS** URL (`https://webrtc.tiklivepro.me`) so the ingest endpoint returns it correctly to the broadcaster's browser.

> **WHIP URL flow:** The frontend never reads `MEDIAMTX_WEBRTC_URL` directly. It calls `GET /stream-orchestrator/sessions/:id/ingest` which returns a `whipUrl` field built server-side from `MEDIAMTX_WEBRTC_URL`. This ensures the correct public URL reaches the browser regardless of how the frontend image was built.

**WebRTC ICE candidates (`SERVER_PUBLIC_IP`):**
MediaMTX runs inside Docker and only knows its container-internal IP. Without additional configuration it would advertise an unreachable `172.x.x.x` address in SDP answers, causing the browser's UDP media to never arrive. The `MTX_WEBRTCADDITIONALHOSTS` env var tells MediaMTX to include the server's public IP in ICE candidates so the browser can reach UDP port 8189.

In `docker-compose.prod.managed.yml` this is wired as:
```yaml
environment:
  MTX_WEBRTCADDITIONALHOSTS: ${SERVER_PUBLIC_IP:?SERVER_PUBLIC_IP is required}
```
The deploy workflow sets `SERVER_PUBLIC_IP` from `secrets.DROPLET_IP` — no separate secret is needed. For manual deploys, add `SERVER_PUBLIC_IP=<your-server-ip>` to `.env` (run `curl -s ifconfig.me` on the server to find it).

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

## Caddy — Reverse Proxy (system service)

Caddy runs as a **systemd service on the host** (not in Docker) and terminates TLS for all public subdomains, forwarding to Docker containers via `localhost:<port>`.

Config file: `infra/caddy/Caddyfile` — versioned in the repo, auto-deployed by the CI workflow on every tag release (`cp` + `systemctl reload caddy`).

| Subdomain / Path | Forwards to | Notes |
|------------------|-------------|-------|
| `tiklivepro.me`, `www.tiklivepro.me` | `localhost:3010` | Next.js frontend |
| `api.tiklivepro.me` OPTIONS (from `tiklivepro.me` or `app.tiklivepro.me`) | — (Caddy responds 204) | CORS preflight handled at the Caddy level so OPTIONS never reaches a backend. Allows `Authorization, Content-Type, X-Correlation-Id` with `credentials: true`, `max-age: 86400`. |
| `api.tiklivepro.me/socket.io/*` | `localhost:3006` | Comments socket.io WebSocket — routed directly to the comments service because the API gateway's `fetch()` proxy does not handle WebSocket upgrades. **The comments container must expose `3006:3006`** in `docker-compose.prod.managed.yml` so Caddy (a host-level service) can reach it. |
| `api.tiklivepro.me/stream-orchestrator/docs*`, `…/metrics` | — (Caddy responds 404) | This proxy path bypasses the API gateway, so the orchestrator's Swagger UI and Prometheus metrics would otherwise be publicly reachable. Blocked at the Caddy level; the `handle` blocks must stay **above** the `@so_*` handles (evaluated in order). |
| `api.tiklivepro.me/stream-orchestrator/*` | `localhost:3009` (prefix stripped) | Stream orchestrator REST API. Caddy injects `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials` via `header { defer }` so CORS headers are present even on 502 responses, preventing the browser from misreporting a backend outage as a CORS error. Caddy sets `X-Forwarded-For`; the orchestrator runs with `trustProxy: true` so its per-IP rate limits key on the real client IP. |
| `api.tiklivepro.me` (all other paths) | `localhost:3000` | API Gateway (REST) |
| `status.tiklivepro.me` | `localhost:3011` | Status page (Next.js). Polls all service `/health` endpoints server-side and renders aggregated status. **DNS A record required**: point `status.tiklivepro.me` at the same droplet IP. The status container must expose `3011:3011`. |
| `hls.tiklivepro.me` | `localhost:8888` | MediaMTX HLS relay. CORS headers added: `Allow-Origin *`, `Allow-Methods GET/HEAD/OPTIONS`, `Allow-Headers Range` |
| `webrtc.tiklivepro.me` | `localhost:8889` | MediaMTX WebRTC/WHIP endpoint. Broadcasters' browsers POST SDP offers here to start a WHIP stream. CORS headers added via `header_down` inside `reverse_proxy`: `Allow-Origin *`, `Allow-Methods GET/HEAD/POST/OPTIONS`, `Allow-Headers Content-Type/Authorization`, `Expose-Headers Location` (required so the browser WHIP client can read the `Location` header from the 201 response). **DNS A record required**: point `webrtc.tiklivepro.me` at the same droplet IP as the other subdomains. |

TLS certificates are provisioned and renewed automatically via Let's Encrypt — no manual configuration needed once DNS A records point to the droplet.

**Install (first time only):**
```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
cp /opt/tiklivepro/infra/caddy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

**Subsequent deploys:** handled automatically by the CI workflow.

---

## Production Compose

File: `docker-compose.prod.yml`

Uses pre-built images from `ghcr.io/tik-live-pro/`. All 10 services plus MediaMTX and the full observability stack.

Features:
- YAML anchors (`x-service-defaults`, `x-backend-env`) for DRY configuration
- `:?` required variable guards — compose will refuse to start if a secret is missing
- `condition: service_healthy` on all `depends_on` blocks — services wait for infra to be ready
- `restart: unless-stopped` on all containers
- MediaMTX allocated 64 MB RAM limit (typical runtime: ~10 MB)
- **Loopback port bindings** — every host port that Caddy proxies (or that is internal-only: NATS, MediaMTX API, observability stack) is bound `127.0.0.1:<port>:<port>` so it is unreachable from the internet. Only two ports are public by design: `1935` (OBS pushes RTMP directly) and `8189/udp` (WebRTC ICE — browsers connect to it directly). Any new service port must follow the same rule.

**Required env vars for MediaMTX in production:**
```
MEDIAMTX_HLS_URL=https://hls.tiklivepro.me       # public HLS URL browsers use to watch streams
MEDIAMTX_WEBRTC_URL=https://webrtc.tiklivepro.me # public WHIP URL broadcaster's browser POSTs to
```
Set these in your `.env.prod` or shell before running `make prod-up`. The `MEDIAMTX_RTMP_URL` defaults to `rtmp://mediamtx:1936` (container-to-container) and does not need to be set. `MEDIAMTX_API_URL` is hardcoded to `http://mediamtx:9997` in the compose file and does not need to be set.

The mediamtx container itself requires no credential env vars — the prod config uses open auth (`user: any`). The mediamtx service in the prod compose exposes three ports to the host:
- `127.0.0.1:8888:8888` — HLS (Caddy proxies as `https://hls.tiklivepro.me`; loopback-only so the plain-HTTP port is not internet-reachable)
- `127.0.0.1:8889:8889` — WebRTC HTTP signalling (Caddy proxies as `https://webrtc.tiklivepro.me`)
- `8189:8189/udp` — WebRTC ICE UDP mux, **public** (browsers connect to it directly; must be a fixed port so Docker forwards it; unreachable browser WebRTC if missing)

`MEDIAMTX_WEBRTC_URL` must be HTTPS so that browsers grant camera/microphone access for WebRTC. Requires a DNS A record for `webrtc.tiklivepro.me` → droplet IP and the Caddy entry above.

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
7. web-deployment.yaml   (includes web-config ConfigMap + HPA)
8. observability.yaml
9. ingress.yaml
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
- Connection strings follow pattern: `postgresql://postgres:<pass>@postgres:5432/tiklivepro_<service>`

### Stream Orchestrator — RTMP ingest

The stream-orchestrator deployment has a secondary `NodePort` service exposing port **31935** for RTMP ingest (broadcaster → cluster). In cloud environments, replace with a TCP LoadBalancer:

```yaml
# Replace NodePort with:
type: LoadBalancer
ports:
  - port: 1935
    targetPort: 1935
    protocol: TCP
    name: rtmp
```

### MediaMTX — HLS/WebRTC relay

MediaMTX runs as a Deployment (single replica) and needs two services:

| Service | Type | Purpose |
|---------|------|---------|
| `mediamtx-internal` | ClusterIP | stream-orchestrator ffmpeg workers push RTMP here on port 1936 |
| `mediamtx-public` | LoadBalancer | Browser viewers fetch HLS (:8888) and WebRTC (:8889) here |

Set `MEDIAMTX_HLS_URL` in the stream-orchestrator secret/ConfigMap to the public LoadBalancer address of `mediamtx-public` so it is returned to browsers in `session.live` events and `GET /sessions/:id` responses.

Manifest: `infra/kubernetes/mediamtx-deployment.yaml` — includes a ConfigMap (prod config), a single-replica Deployment, `mediamtx-internal` ClusterIP (RTMP :1936, REST API :9997), and `mediamtx-public` LoadBalancer (HLS :8888, WebRTC :8889, ICE UDP :8189).

MediaMTX uses open auth (`user: any`) — no API credentials are required. Session security is enforced at the application layer via UUID ingest keys. `MEDIAMTX_HLS_URL` and `MEDIAMTX_WEBRTC_URL` must be set in the stream-orchestrator ConfigMap to the public LoadBalancer addresses so the ingest API returns the correct URLs to browsers.

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
| `tiklivepro.pro` | web-service:3010 |
| `status.tiklivepro.pro` | status-service:3011 |
| `api.tiklivepro.pro` | api-gateway:3000 |
| `grafana.tiklivepro.pro` | grafana:3000 |
| `jaeger.tiklivepro.pro` | jaeger:16686 |
| `prometheus.tiklivepro.pro` | prometheus:9090 |

### Web frontend — `NEXT_PUBLIC_*` in Kubernetes

The `web-deployment.yaml` includes a `web-config` ConfigMap for `NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_COMMENTS_WS_URL`. These values feed into SSR paths at runtime.

**For client-side code**, the values are frozen at image build time. To change them you must rebuild the image with updated `--build-arg` values and roll out the new image.

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
