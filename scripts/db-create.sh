#!/usr/bin/env bash
set -euo pipefail

BASE="${DB_BASE_URL:-postgresql://postgres:password@localhost:5432}"
# Connect to the default "postgres" maintenance database to run CREATE DATABASE
ADMIN_URL="${BASE}/postgres"

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
  psql "$ADMIN_URL" -c "CREATE DATABASE \"$db\";" 2>/dev/null \
    && echo "created" \
    || echo "already exists (skipped)"
done

echo ""
echo "All databases ready."
