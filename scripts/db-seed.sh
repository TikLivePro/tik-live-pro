#!/usr/bin/env bash
set -euo pipefail

BASE="${DB_BASE_URL:-postgresql://postgres:password@localhost:5432}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

run_migrate() {
  local svc="$1"
  local db="$2"
  echo "  migrating $svc → $db"
  (cd "$ROOT/services/$svc" && DATABASE_URL="$BASE/$db" pnpm db:migrate)
}

run_seed() {
  local svc="$1"
  local db="$2"
  run_migrate "$svc" "$db"
  echo "  seeding $svc → $db"
  (cd "$ROOT/services/$svc" && DATABASE_URL="$BASE/$db" pnpm db:seed)
  echo "  done: $svc"
}

run_seed billing tiklivepro_billing

echo ""
echo "All services seeded."
