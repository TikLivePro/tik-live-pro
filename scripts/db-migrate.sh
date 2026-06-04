#!/usr/bin/env bash
set -euo pipefail

BASE="${DB_BASE_URL:-postgresql://postgres:password@localhost:5432}"
SSL="${DB_SSL_PARAMS:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

run_migrate() {
  local svc="$1"
  local db="$2"
  echo "  migrating $svc → $db"
  (cd "$ROOT/services/$svc" && DATABASE_URL="$BASE/$db$SSL" pnpm db:migrate)
  echo "  done: $svc"
}

run_migrate auth                tiklivepro_auth
run_migrate users               tiklivepro_users
run_migrate integrations        tiklivepro_integrations
run_migrate live-session        tiklivepro_sessions
run_migrate stream-orchestrator tiklivepro_stream
run_migrate comments            tiklivepro_comments
run_migrate billing             tiklivepro_billing
run_migrate notifications       tiklivepro_notifications
run_migrate analytics           tiklivepro_analytics

echo ""
echo "All services migrated."
