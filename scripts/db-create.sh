#!/usr/bin/env bash
set -euo pipefail

BASE="${DB_BASE_URL:-postgresql://postgres:password@localhost:5432}"
SSL="${DB_SSL_PARAMS:-}"
# Connect to the admin/maintenance database to run CREATE DATABASE.
# Override with DB_ADMIN_DB=neondb for Neon (default: postgres).
ADMIN_DB="${DB_ADMIN_DB:-postgres}"
ADMIN_URL="${BASE}/${ADMIN_DB}${SSL}"

DATABASES=(
  tiklivepro_auth
  tiklivepro_users
  tiklivepro_integrations
  tiklivepro_sessions
  tiklivepro_comments
  tiklivepro_billing
  tiklivepro_notifications
  tiklivepro_analytics
)

for db in "${DATABASES[@]}"; do
  echo -n "  creating $db ... "
  result=$(psql "$ADMIN_URL" -c "CREATE DATABASE \"$db\";" 2>&1) || true
  if echo "$result" | grep -q "already exists"; then
    echo "already exists (skipped)"
  elif echo "$result" | grep -q "ERROR\|error\|fatal\|FATAL"; then
    echo "FAILED"
    echo "  → $result" >&2
    exit 1
  else
    echo "created"
  fi
done

echo ""
echo "All databases ready."
