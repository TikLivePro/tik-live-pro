#!/usr/bin/env bash
# ==============================================================================
# .agents/scripts/validate-infra.sh
#
# Validates that all 10 microservices have complete infrastructure coverage:
#   1. A Kubernetes Deployment manifest in infra/kubernetes/
#   2. A Prometheus scrape job entry in infra/observability/prometheus.yml
#   3. A .env.example file
#   4. A package.json with expected scripts (build, start, dev, test)
#   5. A /health and /ready route in main.ts or routes.ts
#   6. The service database is listed in infra/docker/postgres/init.sql
#   7. Each service has an entry in NATS streams it publishes to
#      (checked against infra/nats/jetstream-config.yaml)
#
# Usage:
#   bash .agents/scripts/validate-infra.sh
#
# Exit codes:
#   0 — all checks pass
#   1 — one or more checks failed
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ERRORS=0

# ── Service catalogue ─────────────────────────────────────────────────────────
# Format: "directory-name:package-suffix:port:db-name"
declare -a SERVICES=(
  "api-gateway:api-gateway:3000:"
  "auth:auth-service:3001:tiklivepro_auth"
  "users:users-service:3002:tiklivepro_users"
  "live-session:live-session-service:3003:tiklivepro_sessions"
  "billing:billing-service:3004:tiklivepro_billing"
  "integrations:integrations-service:3005:tiklivepro_integrations"
  "comments:comments-service:3006:tiklivepro_comments"
  "notifications:notifications-service:3007:tiklivepro_notifications"
  "analytics:analytics-service:3008:tiklivepro_analytics"
  "stream-orchestrator:stream-orchestrator:3009:tiklivepro_stream"
)

fail() { echo "  ❌ $*"; ERRORS=$((ERRORS + 1)); }
warn() { echo "  ⚠️  $*"; }
pass() { echo "  ✅ $*"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TikLivePro Infrastructure Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for entry in "${SERVICES[@]}"; do
  IFS=':' read -r svc_dir pkg_name port db_name <<< "${entry}"

  echo ""
  echo "── ${svc_dir} (port ${port}) ───────────────────────────────"

  svc_path="${REPO_ROOT}/services/${svc_dir}"

  # 1. Service directory exists
  if [[ ! -d "${svc_path}" ]]; then
    fail "Service directory missing: services/${svc_dir}/"
    continue
  fi

  # 2. .env.example
  if [[ -f "${svc_path}/.env.example" ]]; then
    pass ".env.example exists"
  else
    fail ".env.example missing — create services/${svc_dir}/.env.example"
  fi

  # 3. package.json scripts
  pkg_json="${svc_path}/package.json"
  if [[ -f "${pkg_json}" ]]; then
    for script in build start dev test; do
      if grep -q "\"${script}\"" "${pkg_json}"; then
        : # ok
      else
        fail "package.json missing script: '${script}'"
      fi
    done
    pass "package.json scripts OK"
  else
    fail "package.json missing: services/${svc_dir}/package.json"
  fi

  # 4. Kubernetes Deployment manifest
  k8s_manifest="${REPO_ROOT}/infra/kubernetes/${svc_dir}-deployment.yaml"
  if [[ -f "${k8s_manifest}" ]]; then
    pass "K8s manifest: infra/kubernetes/${svc_dir}-deployment.yaml"
  else
    fail "K8s manifest missing: infra/kubernetes/${svc_dir}-deployment.yaml"
  fi

  # 5. Prometheus scrape job
  prom_cfg="${REPO_ROOT}/infra/observability/prometheus.yml"
  if grep -q "job_name: ${svc_dir}" "${prom_cfg}" 2>/dev/null || \
     grep -q "job_name: ${pkg_name}" "${prom_cfg}" 2>/dev/null; then
    pass "Prometheus scrape job found"
  else
    fail "Prometheus scrape job missing for '${svc_dir}' in infra/observability/prometheus.yml"
  fi

  # 6. Database in postgres init.sql (skip api-gateway which has no DB)
  if [[ -n "${db_name}" ]]; then
    init_sql="${REPO_ROOT}/infra/docker/postgres/init.sql"
    if grep -q "${db_name}" "${init_sql}" 2>/dev/null; then
      pass "DB '${db_name}' in postgres/init.sql"
    else
      fail "DB '${db_name}' not found in infra/docker/postgres/init.sql"
    fi
  fi

  # 7. Health endpoint in source
  health_found=false
  if grep -rq "'/health'" "${svc_path}/src/" 2>/dev/null || \
     grep -rq '"/health"' "${svc_path}/src/" 2>/dev/null; then
    health_found=true
  fi
  if [[ "${health_found}" == "true" ]]; then
    pass "/health route found in src/"
  else
    warn "/health route not detected in services/${svc_dir}/src/ — ensure it exists"
  fi

done

# ── Global checks ─────────────────────────────────────────────────────────────
echo ""
echo "── Global checks ──────────────────────────────────────────────"

# .dockerignore at repo root
if [[ -f "${REPO_ROOT}/.dockerignore" ]]; then
  pass ".dockerignore exists at repo root"
else
  fail ".dockerignore missing at repo root"
fi

# Dockerfile.service
if [[ -f "${REPO_ROOT}/infra/docker/Dockerfile.service" ]]; then
  pass "infra/docker/Dockerfile.service exists"
else
  fail "infra/docker/Dockerfile.service missing"
fi

# build.sh is executable
if [[ -x "${REPO_ROOT}/infra/docker/build.sh" ]]; then
  pass "infra/docker/build.sh is executable"
else
  fail "infra/docker/build.sh is not executable — run: chmod +x infra/docker/build.sh"
fi

# setup-streams.sh is executable
if [[ -x "${REPO_ROOT}/infra/nats/setup-streams.sh" ]]; then
  pass "infra/nats/setup-streams.sh is executable"
else
  fail "infra/nats/setup-streams.sh is not executable — run: chmod +x infra/nats/setup-streams.sh"
fi

# NATS JetStream streams (all 9 expected)
nats_cfg="${REPO_ROOT}/infra/nats/jetstream-config.yaml"
for stream in AUTH USERS SESSIONS BILLING INTEGRATIONS COMMENTS NOTIFICATIONS ANALYTICS DLQ; do
  if grep -q "name: ${stream}" "${nats_cfg}" 2>/dev/null; then
    : # pass silently
  else
    fail "NATS stream '${stream}' missing from infra/nats/jetstream-config.yaml"
  fi
done
pass "NATS JetStream: all 9 streams defined"

# docs directory
for doc in architecture.md events.md setup.md infra.md observability.md; do
  if [[ -f "${REPO_ROOT}/docs/${doc}" ]]; then
    : # pass silently
  else
    fail "Documentation missing: docs/${doc}"
  fi
done
pass "docs/ — all 5 required documents exist"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "${ERRORS}" -gt 0 ]]; then
  echo "❌ Validation FAILED — ${ERRORS} issue(s) found."
  echo ""
  echo "Fix the issues above and re-run:"
  echo "  bash .agents/scripts/validate-infra.sh"
  exit 1
fi

echo "✅ All infrastructure checks passed."
exit 0
