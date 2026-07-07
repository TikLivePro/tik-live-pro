# TikLivePro — NATS JetStream Event Contracts

> **Last updated:** 2026-07-06 (auth.user.registered gains optional avatarUrl from OAuth providers; comments-service comment.received consumer now persists comments before WebSocket fan-out)
> Update this file whenever a stream, consumer, or event schema is added or changed.
> The canonical stream configuration lives in `infra/nats/jetstream-config.yaml`.

## Table of Contents

1. [Event Envelope](#event-envelope)
2. [Stream Catalogue](#stream-catalogue)
3. [Consumer Catalogue](#consumer-catalogue)
4. [Event Reference](#event-reference)
5. [Idempotency](#idempotency)
6. [Dead-Letter Handling](#dead-letter-handling)

---

## Event Envelope

All events share this TypeScript envelope:

```typescript
interface BaseEvent<T> {
  eventId: string;       // UUID v4 — used for deduplication
  version: number;       // schema version; increment on breaking changes
  subject: string;       // NATS subject this was published on
  occurredAt: string;    // ISO 8601 UTC
  correlationId: string; // propagated across the request chain (x-correlation-id)
  traceId: string;       // OpenTelemetry W3C trace ID
  payload: T;
}
```

Subjects and payload types are defined in `packages/events/src/subjects.ts`.

---

## Stream Catalogue

| NATS Stream | Subjects | Retention | Max Messages | Max Age | Replicas | Dedup Window |
|------------|---------|-----------|-------------|---------|----------|-------------|
| AUTH | `auth.>` | limits | 1 000 000 | 168 h (7 d) | 3 | 2 min |
| USERS | `user.>` | limits | 500 000 | 720 h (30 d) | 3 | 2 min |
| SESSIONS | `session.>`, `stream.>` | limits | 10 000 000 | 2 160 h (90 d) | 3 | 5 min |
| BILLING | `billing.>` | limits | 500 000 | 8 760 h (365 d) | 3 | 5 min |
| INTEGRATIONS | `integration.>` | limits | 500 000 | 720 h (30 d) | 3 | 2 min |
| COMMENTS | `comment.>` | limits | 50 000 000 | 720 h (30 d) | 3 | 30 s |
| NOTIFICATIONS | `notification.>` | **workqueue** | 1 000 000 | 24 h (1 d) | 3 | 1 min |
| ANALYTICS | `analytics.>` | limits | 100 000 000 | 2 160 h (90 d) | 3 | 1 min |
| DLQ | `dlq.>` | limits | 1 000 000 | 336 h (14 d) | 3 | 2 min |

> **Notes**
> - `workqueue` retention means each message is deleted once **any** consumer acknowledges it (exactly-once job semantics).
> - `replicas: 3` matches the 3-node NATS cluster for HA — reduce to 1 on single-node dev if needed.
> - Apply streams: `make nats-streams` (dev) or `make nats-streams-prod` (prod).

---

## Consumer Catalogue

Pre-created durable pull-consumers (all use `ack_policy: explicit`):

| Stream | Consumer name | Filter subject | Max deliver | Ack wait | Owner service |
|--------|--------------|----------------|-------------|----------|---------------|
| SESSIONS | `stream-orchestrator-session-created` | `session.created` | 5 | 30 s | stream-orchestrator |
| SESSIONS | `stream-orchestrator-session-starting` | `session.starting` | 5 | 30 s | stream-orchestrator |
| SESSIONS | `stream-orchestrator-session-ended` | `session.ended` | 5 | 30 s | stream-orchestrator |
| SESSIONS | `live-session-session-live` | `session.live` | 5 | 30 s | live-session (status→live, stores hlsUrl) |
| SESSIONS | `live-session-broadcast-stopped` | `session.broadcast.stopped` | 5 | 30 s | live-session (status→ended) |
| SESSIONS | `analytics-sessions` | `session.ended` | 5 | 60 s | analytics |
| SESSIONS | `notifications-session-started` | `session.started` | 3 | 10 s | notifications |
| BILLING | `users-entitlement` | `billing.entitlement.updated` | 10 | 60 s | users |
| BILLING | `analytics-billing` | `billing.>` | 5 | 30 s | analytics |
| COMMENTS | `comments-websocket` | `comment.received` | 3 | 10 s | comments |
| INTEGRATIONS | `stream-orchestrator-tokens` | `integration.token.rotated` | 5 | 30 s | stream-orchestrator |
| INTEGRATIONS | `live-session-platform-ended` | `integration.platform.session_ended` | 5 | 30 s | live-session |
| AUTH | `analytics-auth` | `auth.>` | 3 | 15 s | analytics |
| NOTIFICATIONS | `notifications-worker` | `notification.>` | 5 | 30 s | notifications |

---

## Event Reference

### Auth Domain (`auth.>`)

**`auth.user.registered`** (v1)
```typescript
{
  userId: UserId;
  email: Email;
  displayName: string;
  avatarUrl?: string | null;  // profile picture from the OAuth provider, when registered via OAuth
  subscriptionTier: 'free' | 'premium';
  locale: string;
}
```
Consumers: `users-service` (create profile), `billing-service` (create free subscription), `analytics-service`

---

**`auth.user.logged_in`** (v1)
```typescript
{
  userId: UserId;
  email: Email;
  ipAddress: string;
  userAgent: string;
}
```
Consumers: `analytics-service`

---

### Session Domain (`session.>`, `stream.>`)

**`session.created`** (v1)
```typescript
{
  sessionId: LiveSessionId;
  userId: UserId;
  title: string;
  destinationAccountIds: SocialAccountId[];
}
```
Consumers: `stream-orchestrator` (creates RTMP endpoints on TikTok/FB)

---

**`session.starting`** (v1)
```typescript
{
  sessionId: LiveSessionId;
  userId: UserId;
  previousStatus: LiveSessionStatus;
  status: 'starting';
  occurredAt: string;
}
```
Consumers: `notifications`, `analytics`, `stream-orchestrator` (begins broadcasting)

---

**`session.live`** (v1)
```typescript
{
  sessionId: LiveSessionId;
  userId: UserId;
  previousStatus: 'starting';
  status: 'live';
  occurredAt: string;
  hlsUrl: string;   // HLS playlist URL served by MediaMTX, e.g. "http://host:8888/live/{ingestKey}/index.m3u8"
}
```
Publisher: `stream-orchestrator` (fires when first ffmpeg stats are received — stream is confirmed live).
Consumers: `live-session` (status → live, stores `platformHlsUrl`), `notifications` (push: "You are live!"), `analytics`

---

**`session.ended`** (v1)
```typescript
{
  sessionId: LiveSessionId;
  userId: UserId;
  status: 'ended';
  occurredAt: string;
}
```
Consumers: `stream-orchestrator` (stop broadcast), `comments` (stop pollers), `analytics`

---

**`stream.destination.status_changed`** (v1)
```typescript
{
  sessionId: LiveSessionId;
  socialAccountId: SocialAccountId;  // '__platform__' for the MediaMTX platform destination
  platform: 'tiktok' | 'facebook' | 'platform';
  previousStatus: DestinationStatus;
  status: DestinationStatus;
  errorMessage?: string;
}
```
`platform: 'platform'` indicates the MediaMTX platform-native destination (always present). Social platforms are present only when accounts are connected.
Consumers: `live-session` (update destination record), Frontend via WebSocket push

---

### Comment Domain (`comment.>`)

**`comment.received`** (v1)
```typescript
{
  id: CommentId;
  sessionId: LiveSessionId;
  platform: 'tiktok' | 'facebook';
  platformCommentId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  content: string;
  receivedAt: string;
}
```
Consumers: `comments-service` (persist + WebSocket broadcast), `analytics-service`

---

### Billing Domain (`billing.>`)

**`billing.entitlement.updated`** (v1)
```typescript
{
  userId: UserId;
  entitlement: {
    userId: UserId;
    tier: 'free' | 'premium';
    features: Feature[];
    maxSocialAccounts: number;
  };
}
```
Consumers: `users-service` (update feature flags), `integrations-service` (enforce account limit), `api-gateway` (invalidate entitlement cache)

---

### Integrations Domain (`integration.>`)

**`integration.token.rotated`** (v1)
```typescript
{
  socialAccountId: SocialAccountId;
  userId: UserId;
  platform: 'tiktok' | 'facebook';
  rotatedAt: string;
}
```
Consumers: `stream-orchestrator` (re-fetch token before next broadcast)

---

**`integration.account.disconnected`** (v1)
```typescript
{
  socialAccountId: SocialAccountId;
  userId: UserId;
  platform: 'tiktok' | 'facebook';
  platformUserId: string;
  reason: 'user_initiated' | 'token_expired' | 'platform_revoked';
}
```
Published by: `integrations-service` — either when the user disconnects via the app (DELETE `/integrations/accounts/:id`) or when TikTok sends a `user.authorization.revoke` webhook (`reason: 'platform_revoked'`).

Consumers: `stream-orchestrator` (remove destination from any active session), `live-session` (mark affected destinations as ended)

---

**`integration.platform.session_ended`** (v1)
```typescript
{
  platform: 'tiktok' | 'facebook';
  platformUserId: string;
  socialAccountId: SocialAccountId;
}
```
Published by: `integrations-service` when TikTok sends a `live.session.ended` webhook, meaning TikTok force-terminated a live session on their end (e.g., policy violation, network drop).

Consumers: `live-session` (find active session with this `socialAccountId` as a destination and trigger graceful teardown)

---

### Notification Domain (`notification.>`)

**`notification.send`** (v1)
```typescript
{
  userId: UserId;
  channel: 'push' | 'email' | 'in-app';
  templateId: string;
  templateVars: Record<string, string>;
}
```
Consumers: `notifications-service` worker (workqueue — exactly-once delivery)

---

## Idempotency

Each consumer tracks processed `eventId` values. Duplicate messages (due to NATS redelivery after a failed ack) are discarded after the first successful processing.

Implementation options:
- **Redis SET** with TTL matching the stream's `duplicate_window`
- **DB unique index** on `(eventId, consumer_name)` per consumer group

NATS JetStream also has a built-in dedup window per stream (see `duplicate_window` in stream catalogue above), which catches publisher-side duplicates.

---

## Dead-Letter Handling

When a consumer exhausts its `max_deliver` retries, it publishes the failed message to:
```
dlq.<original-subject>
```

Example: a `session.created` event that failed 5 times → `dlq.session.created`

The DLQ stream retains messages for 14 days. A Prometheus alert fires if DLQ depth exceeds a threshold (see `infra/observability/alerts/service-alerts.yml`).

**Manual replay:**
```bash
# Inspect DLQ
nats stream view DLQ

# Republish a specific message to its original subject
nats pub session.created "$(nats stream get DLQ <seq>)"
```
