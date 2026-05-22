#!/usr/bin/env bash
# ==============================================================================
# infra/nats/setup-streams.sh — Create / update JetStream streams & consumers
#
# Reads the canonical definitions from infra/nats/jetstream-config.yaml and
# applies them to the running NATS server using the `nats` CLI.
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │  Prerequisites                                                          │
# │    nats CLI ≥ 0.1.4  →  https://github.com/nats-io/natscli/releases    │
# │    NATS must be running (make infra-up in dev, or in-cluster in prod)   │
# └─────────────────────────────────────────────────────────────────────────┘
#
# Usage:
#   # Development (local NATS on 4222):
#   make nats-streams
#   # or:
#   bash infra/nats/setup-streams.sh
#
#   # Production (point at in-cluster NATS):
#   NATS_URL=nats://nats-service.tik-live-pro.svc.cluster.local:4222 \
#     bash infra/nats/setup-streams.sh
#
#   # With credentials (when NATS auth is enabled):
#   NATS_URL=nats://user:pass@nats:4222 bash infra/nats/setup-streams.sh
#
# Exit codes:
#   0  — success (all streams and consumers created/updated)
#   1  — nats CLI not found, or a stream/consumer operation failed
# ==============================================================================

set -euo pipefail

NATS_URL="${NATS_URL:-nats://localhost:4222}"
NATS_CTX=""   # optional: --context <name> for nats CLI context

nats_cmd() {
  nats --server "${NATS_URL}" ${NATS_CTX:+--context "${NATS_CTX}"} "$@"
}

# ── Sanity check ──────────────────────────────────────────────────────────────
if ! command -v nats &>/dev/null; then
  echo "ERROR: 'nats' CLI not found."
  echo "Install: https://github.com/nats-io/natscli/releases"
  exit 1
fi

echo "Connecting to NATS at ${NATS_URL}…"
nats_cmd server ping || { echo "ERROR: Cannot reach NATS server."; exit 1; }
echo ""

# ==============================================================================
# Helper: upsert_stream <name> <subjects> <retention> <max_msgs> <max_age>
#                       <max_msg_size> <replicas> <discard> <dup_window>
#
# Creates the stream if it doesn't exist; updates it if it does.
# Arguments map 1-to-1 with `nats stream add` flags.
# ==============================================================================
upsert_stream() {
  local name="$1" subjects="$2" retention="$3" max_msgs="$4" max_age="$5"
  local max_msg_size="${6:--1}" replicas="${7:-3}" discard="${8:-old}" dup_window="${9:-2m}"

  if nats_cmd stream info "${name}" &>/dev/null; then
    echo "  [~] Updating stream: ${name}"
    nats_cmd stream edit "${name}" \
      --subjects="${subjects}" \
      --retention="${retention}" \
      --max-msgs="${max_msgs}" \
      --max-age="${max_age}" \
      --max-msg-size="${max_msg_size}" \
      --replicas="${replicas}" \
      --discard="${discard}" \
      --dupe-window="${dup_window}" \
      --force 2>/dev/null || echo "    (no change)"
  else
    echo "  [+] Creating stream: ${name}"
    nats_cmd stream add "${name}" \
      --subjects="${subjects}" \
      --retention="${retention}" \
      --storage=file \
      --max-msgs="${max_msgs}" \
      --max-age="${max_age}" \
      --max-msg-size="${max_msg_size}" \
      --replicas="${replicas}" \
      --discard="${discard}" \
      --dupe-window="${dup_window}" \
      --no-deny-delete \
      --no-deny-purge \
      --defaults
  fi
}

# ==============================================================================
# Helper: upsert_consumer <stream> <name> <filter_subject> <max_deliver>
#                         <ack_wait> <deliver_policy>
# ==============================================================================
upsert_consumer() {
  local stream="$1" name="$2" filter="$3" max_deliver="${4:-5}"
  local ack_wait="${5:-30s}" deliver_policy="${6:-all}"

  if nats_cmd consumer info "${stream}" "${name}" &>/dev/null; then
    echo "  [~] Consumer already exists: ${stream} / ${name} (skipping)"
  else
    echo "  [+] Creating consumer: ${stream} / ${name}"
    nats_cmd consumer add "${stream}" "${name}" \
      --filter="${filter}" \
      --ack=explicit \
      --pull \
      --durable="${name}" \
      --max-deliver="${max_deliver}" \
      --ack-wait="${ack_wait}" \
      --deliver="${deliver_policy}" \
      --defaults
  fi
}

# ==============================================================================
# STREAMS
# ==============================================================================
echo "━━━ Streams ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

#             name          subjects         retention  max_msgs   max_age  max_msg_size replicas discard dup_window
upsert_stream AUTH          "auth.>"         limits     1000000    168h     65536        3        old     2m
upsert_stream USERS         "user.>"         limits     500000     720h     131072       3        old     2m
upsert_stream SESSIONS      "session.>,stream.>" limits  10000000  2160h    131072       3        old     5m
upsert_stream BILLING       "billing.>"      limits     500000     8760h    65536        3        old     5m
upsert_stream INTEGRATIONS  "integration.>"  limits     500000     720h     65536        3        old     2m
upsert_stream COMMENTS      "comment.>"      limits     50000000   720h     65536        3        old     30s
upsert_stream NOTIFICATIONS "notification.>" workqueue  1000000    24h      65536        3        old     1m
upsert_stream ANALYTICS     "analytics.>"    limits     100000000  2160h    32768        3        old     1m
upsert_stream DLQ           "dlq.>"          limits     1000000    336h     131072       3        old     2m

echo ""

# ==============================================================================
# CONSUMERS
# ==============================================================================
echo "━━━ Consumers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# SESSIONS
upsert_consumer SESSIONS stream-orchestrator        "session.created"   5  30s all
upsert_consumer SESSIONS analytics-sessions         "session.ended"     5  60s all
upsert_consumer SESSIONS notifications-session-started "session.started" 3 10s all

# BILLING
upsert_consumer BILLING  users-entitlement          "billing.entitlement.updated" 10 60s all
upsert_consumer BILLING  analytics-billing          "billing.>"                    5  30s all

# COMMENTS
upsert_consumer COMMENTS comments-websocket         "comment.received"  3  10s all

# INTEGRATIONS
upsert_consumer INTEGRATIONS stream-orchestrator-tokens "integration.token.rotated" 5 30s all

# AUTH
upsert_consumer AUTH     analytics-auth             "auth.>"            3  15s all

# NOTIFICATIONS
upsert_consumer NOTIFICATIONS notifications-worker  "notification.>"    5  30s all

echo ""
echo "✓ JetStream setup complete."
nats_cmd stream ls
