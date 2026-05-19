# TikLivePro — NATS JetStream Event Contracts

All events share this envelope:

```typescript
interface BaseEvent<T> {
  eventId: string;       // UUID, used for idempotency
  version: number;       // schema version; increment on breaking changes
  subject: string;       // NATS subject this was published on
  occurredAt: string;    // ISO 8601 UTC
  correlationId: string; // trace across request chain
  traceId: string;       // OpenTelemetry trace ID
  payload: T;
}
```

## Streams

| NATS Stream | Subjects | Retention | Max Age |
|------------|---------|-----------|---------|
| AUTH | `auth.>` | limits | 7d |
| USERS | `user.>` | limits | 30d |
| SESSIONS | `session.>`, `stream.>` | limits | 90d |
| COMMENTS | `comment.>` | limits | 30d |
| BILLING | `billing.>` | limits | 365d |
| NOTIFICATIONS | `notification.>` | workqueue | 1d |
| ANALYTICS | `analytics.>` | limits | 90d |
| DLQ | `dlq.>` | limits | 14d |

## Event Reference

### Auth Domain

**`auth.user.registered`** (v1)
```typescript
{
  userId: UserId;
  email: Email;
  displayName: string;
  subscriptionTier: 'free' | 'premium';
  locale: string;
}
```
Consumers: User Service (creates profile), Billing Service (creates free subscription), Analytics

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
Consumers: Analytics

### Session Domain

**`session.created`** (v1)
```typescript
{
  sessionId: LiveSessionId;
  userId: UserId;
  title: string;
  destinationAccountIds: SocialAccountId[];
}
```
Consumers: Stream Orchestrator (creates RTMP endpoints)

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
Consumers: Notifications, Analytics, Stream Orchestrator (begins broadcasting)

---

**`session.live`** (v1)
Same schema as `session.starting` with `status: 'live'`.
Consumers: Notifications (push: "You are live!"), Analytics

---

**`session.ended`** (v1)
Consumers: Stream Orchestrator (stop broadcast), Comment poller (stop), Analytics

### Stream Domain

**`stream.destination.status_changed`** (v1)
```typescript
{
  sessionId: LiveSessionId;
  socialAccountId: SocialAccountId;
  platform: 'tiktok' | 'facebook';
  previousStatus: DestinationStatus;
  status: DestinationStatus;
  errorMessage?: string;
}
```
Consumers: Live Session Service (update destination record), Frontend (via WS push)

### Comment Domain

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
Consumers: Comments Service (persist + WebSocket broadcast), Analytics

### Billing Domain

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
Consumers: Integrations Service (enforce account limit), API Gateway (cache entitlement)

## Idempotency

Each consumer tracks processed `eventId` values. Duplicate messages (due to NATS redelivery) are discarded after the first successful processing. Use a Redis SET or a DB unique index on `eventId` per consumer group.

## Dead-Letter Handling

On persistent failure (after `max_deliver` retries), the consumer publishes to `dlq.<original-subject>` for manual inspection and replay. An alert fires if DLQ depth exceeds threshold (Prometheus alert rule in `infra/observability/`).
