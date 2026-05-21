#!/usr/bin/env bash
set -euo pipefail

BASE="${DB_BASE_URL:-postgresql://postgres:password@localhost:5432}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

run_migrate() {
  local svc="$1"
  local db="$2"
  echo "  migrating $svc → $db"
  (cd "$ROOT/services/$svc" && DATABASE_URL="$BASE/$db" pnpm db:migrate)
  echo "  done: $svc"
}

run_migrate auth                tiklive_auth
run_migrate users               tiklive_users
run_migrate integrations        tiklive_integrations
run_migrate live-session        tiklive_sessions
run_migrate stream-orchestrator tiklive_sessions
run_migrate comments            tiklive_comments
run_migrate billing             tiklive_billing
run_migrate notifications       tiklive_notifications
run_migrate analytics           tiklive_analytics

echo ""
echo "All services migrated."
