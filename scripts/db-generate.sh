#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

run_generate() {
  local svc="$1"
  echo "  generating $svc"
  (cd "$ROOT/services/$svc" && pnpm db:generate)
  echo "  done: $svc"
}

run_generate auth
run_generate users
run_generate integrations
run_generate live-session
run_generate stream-orchestrator
run_generate comments
run_generate billing
run_generate notifications
run_generate analytics

echo ""
echo "All schemas generated."
