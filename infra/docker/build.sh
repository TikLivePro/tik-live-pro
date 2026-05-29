#!/usr/bin/env bash
# ==============================================================================
# infra/docker/build.sh — build & tag Docker images for tik-live-pro services
#
# Usage:
#   bash infra/docker/build.sh [SERVICE] [TAG]
#
# Examples:
#   bash infra/docker/build.sh auth              # build auth-service:latest
#   bash infra/docker/build.sh billing 1.2.3     # build billing-service:1.2.3
#   bash infra/docker/build.sh all               # build all services
#
# Env overrides:
#   REGISTRY    — image registry prefix  (default: ghcr.io/tik-live-pro)
#   PUSH        — set to "1" to push after building
#   CACHE_FROM  — Docker cache source (e.g. type=gha for GitHub Actions cache)
# ==============================================================================

set -euo pipefail

REGISTRY="${REGISTRY:-ghcr.io/tik-live-pro}"
TAG="${2:-latest}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOCKERFILE_DIR="${REPO_ROOT}/infra/docker"

# ── Service catalogue ─────────────────────────────────────────────────────────
# Format: "SERVICE_NAME:PACKAGE_NAME:PORT"
declare -a SERVICES=(
  "api-gateway:api-gateway:3000"
  "auth:auth-service:3001"
  "users:users-service:3002"
  "live-session:live-session-service:3003"
  "billing:billing-service:3004"
  "integrations:integrations-service:3005"
  "comments:comments-service:3006"
  "notifications:notifications-service:3007"
  "analytics:analytics-service:3008"
  "stream-orchestrator:stream-orchestrator:3009"
)

build_service() {
  local entry="$1"
  local svc_name package_name port dockerfile image_tag

  IFS=':' read -r svc_name package_name port <<< "${entry}"
  image_tag="${REGISTRY}/${package_name}:${TAG}"

  # Use a dedicated Dockerfile if one exists, otherwise fall back to the template
  if [[ -f "${DOCKERFILE_DIR}/Dockerfile.${svc_name}" ]]; then
    dockerfile="${DOCKERFILE_DIR}/Dockerfile.${svc_name}"
  else
    dockerfile="${DOCKERFILE_DIR}/Dockerfile.service"
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Building: ${image_tag}"
  echo "  Dockerfile: ${dockerfile}"
  echo "  SERVICE_NAME=${svc_name}  PACKAGE_NAME=${package_name}  PORT=${port}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local cache_args=()
  if [[ -n "${CACHE_FROM:-}" ]]; then
    cache_args=(--cache-from "${CACHE_FROM}")
  fi

  docker build \
    -f "${dockerfile}" \
    --build-arg SERVICE_NAME="${svc_name}" \
    --build-arg PACKAGE_NAME="${package_name}" \
    --build-arg SERVICE_PORT="${port}" \
    -t "${image_tag}" \
    "${cache_args[@]+"${cache_args[@]}"}" \
    "${REPO_ROOT}"

  if [[ "${PUSH:-0}" == "1" ]]; then
    echo "  Pushing ${image_tag}…"
    docker push "${image_tag}"
  fi
}

build_web() {
  local image_tag="${REGISTRY}/web:${TAG}"
  local dockerfile="${DOCKERFILE_DIR}/Dockerfile.web"

  # NEXT_PUBLIC_* vars are baked into the JS bundle at build time.
  # Override via env vars before running this script, e.g.:
  #   NEXT_PUBLIC_API_URL=https://api.example.com bash infra/docker/build.sh web
  local api_url="${NEXT_PUBLIC_API_URL:-https://api.tiklivepro.me}"
  local ws_url="${NEXT_PUBLIC_COMMENTS_WS_URL:-https://api.tiklivepro.me}"
  local giphy_key="${NEXT_PUBLIC_GIPHY_API_KEY:-}"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Building: ${image_tag}  (Next.js standalone)"
  echo "  Dockerfile: ${dockerfile}"
  echo "  NEXT_PUBLIC_API_URL=${api_url}"
  echo "  NEXT_PUBLIC_COMMENTS_WS_URL=${ws_url}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local cache_args=()
  if [[ -n "${CACHE_FROM:-}" ]]; then
    cache_args=(--cache-from "${CACHE_FROM}")
  fi

  docker build \
    -f "${dockerfile}" \
    --build-arg "NEXT_PUBLIC_API_URL=${api_url}" \
    --build-arg "NEXT_PUBLIC_COMMENTS_WS_URL=${ws_url}" \
    --build-arg "NEXT_PUBLIC_GIPHY_API_KEY=${giphy_key}" \
    -t "${image_tag}" \
    "${cache_args[@]+"${cache_args[@]}"}" \
    "${REPO_ROOT}"

  if [[ "${PUSH:-0}" == "1" ]]; then
    echo "  Pushing ${image_tag}…"
    docker push "${image_tag}"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
TARGET="${1:-}"

if [[ -z "${TARGET}" || "${TARGET}" == "all" ]]; then
  echo "Building ALL services (TAG=${TAG})"
  for entry in "${SERVICES[@]}"; do
    build_service "${entry}"
  done
  build_web
elif [[ "${TARGET}" == "web" ]]; then
  build_web
else
  # Find the matching entry
  matched=false
  for entry in "${SERVICES[@]}"; do
    svc_name="${entry%%:*}"
    if [[ "${svc_name}" == "${TARGET}" ]]; then
      build_service "${entry}"
      matched=true
      break
    fi
  done

  if [[ "${matched}" == "false" ]]; then
    echo "ERROR: Unknown service '${TARGET}'"
    echo ""
    echo "Available services:"
    for entry in "${SERVICES[@]}"; do
      echo "  ${entry%%:*}"
    done
    echo "  web"
    exit 1
  fi
fi

echo ""
echo "✓ Done."
