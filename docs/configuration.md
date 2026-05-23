> Last updated: 2026-05-23

# Configuration Reference

All services and apps are configured exclusively via environment variables. At startup each service validates its variables with a Zod schema and **refuses to start** if any required variable is missing or invalid.

## Quick start

```bash
# 1. Copy every example file
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/mobile/.env.example apps/mobile/.env
cp services/api-gateway/.env.example services/api-gateway/.env
cp services/auth/.env.example services/auth/.env
cp services/users/.env.example services/users/.env
cp services/live-session/.env.example services/live-session/.env
cp services/billing/.env.example services/billing/.env
cp services/integrations/.env.example services/integrations/.env
cp services/comments/.env.example services/comments/.env
cp services/notifications/.env.example services/notifications/.env
cp services/analytics/.env.example services/analytics/.env
cp services/stream-orchestrator/.env.example services/stream-orchestrator/.env

# 2. Generate the shared JWT secret (must be identical across all services)
openssl rand -base64 64

# 3. Generate the token encryption key (integrations service only)
openssl rand -base64 32

# 4. Fill in platform OAuth credentials — see "OAuth credentials" section below
```

---

## Shared secrets

These values **must match exactly** across every service that uses them.

| Variable | Used by | Description |
|---|---|---|
| `JWT_SECRET` | api-gateway, auth, users, live-session, billing, integrations, comments, notifications, analytics | HMAC-SHA-256 secret for signing and verifying JWTs. Minimum 64 characters. |
| `TOKEN_ENCRYPTION_KEY` | integrations | AES-256-GCM key for encrypting OAuth tokens at rest. Minimum 32 characters. |

Generate them once and paste the same value into each `.env` file:

```bash
# JWT_SECRET
openssl rand -base64 64

# TOKEN_ENCRYPTION_KEY
openssl rand -base64 32
```

> **Production**: store these in a secrets manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault) and inject them as environment variables at runtime. Never commit real secrets to the repository.

---

## Root `.env`

Path: `.env`

| Variable | Default | Description |
|---|---|---|
| `DB_BASE_URL` | `postgresql://postgres:password@localhost:5432` | Base Postgres connection string. Each service database name is appended automatically (e.g. `.../tiklive_auth`). Override when host, port, or credentials differ. |

---

## Service environment variables

### API Gateway — `services/api-gateway/.env`

Port: **3000**

| Variable | Default | Required | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | Yes | `development` or `production` |
| `PORT` | `3000` | Yes | HTTP listen port |
| `LOG_LEVEL` | `info` | Yes | Pino log level (`trace` / `debug` / `info` / `warn` / `error`) |
| `JWT_SECRET` | — | Yes | Shared JWT secret — must match all downstream services |
| `AUTH_SERVICE_URL` | `http://localhost:3001` | Yes | Internal URL of the Auth service |
| `USER_SERVICE_URL` | `http://localhost:3002` | Yes | Internal URL of the Users service |
| `SESSION_SERVICE_URL` | `http://localhost:3003` | Yes | Internal URL of the Live Session service |
| `BILLING_SERVICE_URL` | `http://localhost:3004` | Yes | Internal URL of the Billing service |
| `INTEGRATION_SERVICE_URL` | `http://localhost:3005` | Yes | Internal URL of the Integrations service |
| `COMMENTS_SERVICE_URL` | `http://localhost:3006` | Yes | Internal URL of the Comments service |
| `NOTIFICATIONS_SERVICE_URL` | `http://localhost:3007` | Yes | Internal URL of the Notifications service |
| `ANALYTICS_SERVICE_URL` | `http://localhost:3008` | Yes | Internal URL of the Analytics service |

---

### Auth — `services/auth/.env`

Port: **3001**

| Variable | Default | Required | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | Yes | Runtime environment |
| `PORT` | `3001` | Yes | HTTP listen port |
| `LOG_LEVEL` | `info` | Yes | Pino log level |
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/tiklive_auth` | Yes | Postgres connection string for the auth database |
| `NATS_URL` | `nats://localhost:4222` | Yes | NATS JetStream broker URL |
| `JWT_SECRET` | — | Yes | Shared JWT secret (min 64 chars) |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Yes | Access token TTL (e.g. `15m`, `1h`) |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Yes | Refresh token TTL (e.g. `30d`) |
| `CORRELATION_ID_HEADER` | `x-correlation-id` | Yes | Header name for correlation IDs |
| `TRACE_ID_HEADER` | `x-trace-id` | Yes | Header name for trace IDs |

---

### Users — `services/users/.env`

Port: **3002**

| Variable | Default | Required | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | Yes | Runtime environment |
| `PORT` | `3002` | Yes | HTTP listen port |
| `LOG_LEVEL` | `info` | Yes | Pino log level |
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/tiklive_users` | Yes | Postgres connection string |
| `NATS_URL` | `nats://localhost:4222` | Yes | NATS JetStream broker URL |
| `JWT_SECRET` | — | Yes | Shared JWT secret |
| `CDN_BASE_URL` | `https://cdn.tiklive.pro` | Yes | Base URL for uploaded avatars |
| `CORRELATION_ID_HEADER` | `x-correlation-id` | Yes | Correlation ID header |
| `TRACE_ID_HEADER` | `x-trace-id` | Yes | Trace ID header |

---

### Live Session — `services/live-session/.env`

Port: **3003**

| Variable | Default | Required | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | Yes | Runtime environment |
| `PORT` | `3003` | Yes | HTTP listen port |
| `LOG_LEVEL` | `info` | Yes | Pino log level |
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/tiklive_sessions` | Yes | Postgres connection string |
| `NATS_URL` | `nats://localhost:4222` | Yes | NATS JetStream broker URL |
| `JWT_SECRET` | — | Yes | Shared JWT secret |
| `CORRELATION_ID_HEADER` | `x-correlation-id` | Yes | Correlation ID header |
| `TRACE_ID_HEADER` | `x-trace-id` | Yes | Trace ID header |

---

### Billing — `services/billing/.env`

Port: **3004**

| Variable | Default | Required | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | Yes | Runtime environment |
| `PORT` | `3004` | Yes | HTTP listen port |
| `LOG_LEVEL` | `info` | Yes | Pino log level |
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/tiklive_billing` | Yes | Postgres connection string |
| `NATS_URL` | `nats://localhost:4222` | Yes | NATS JetStream broker URL |
| `JWT_SECRET` | — | Yes | Shared JWT secret |
| `STRIPE_SECRET_KEY` | — | Yes | Stripe secret key (`sk_test_…` for development, `sk_live_…` for production) |
| `STRIPE_WEBHOOK_SECRET` | — | Yes | Stripe webhook signing secret (`whsec_…`). Obtain from the Stripe Dashboard → Webhooks |
| `STRIPE_PREMIUM_PRICE_ID` | — | Yes | Stripe Price ID for the Premium plan (`price_…`) |
| `CORRELATION_ID_HEADER` | `x-correlation-id` | Yes | Correlation ID header |
| `TRACE_ID_HEADER` | `x-trace-id` | Yes | Trace ID header |

---

### Integrations — `services/integrations/.env`

Port: **3005**

| Variable | Default | Required | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | Yes | Runtime environment |
| `PORT` | `3005` | Yes | HTTP listen port |
| `LOG_LEVEL` | `info` | Yes | Pino log level |
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/tiklive_integrations` | Yes | Postgres connection string |
| `NATS_URL` | `nats://localhost:4222` | Yes | NATS JetStream broker URL |
| `JWT_SECRET` | — | Yes | Shared JWT secret |
| `TIKTOK_CLIENT_KEY` | — | Yes | TikTok app client key |
| `TIKTOK_CLIENT_SECRET` | — | Yes | TikTok app client secret |
| `FACEBOOK_APP_ID` | — | Yes | Facebook app ID |
| `FACEBOOK_APP_SECRET` | — | Yes | Facebook app secret |
| `OAUTH_REDIRECT_BASE_URL` | `http://localhost:3005` | Yes | Base URL for OAuth callbacks, e.g. `https://api.tiklive.pro` in production |
| `TOKEN_ENCRYPTION_KEY` | — | Yes | AES-256-GCM key for OAuth token encryption at rest (min 32 chars) |
| `CORRELATION_ID_HEADER` | `x-correlation-id` | Yes | Correlation ID header |
| `TRACE_ID_HEADER` | `x-trace-id` | Yes | Trace ID header |

---

### Comments — `services/comments/.env`

Port: **3006**

| Variable | Default | Required | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | Yes | Runtime environment |
| `PORT` | `3006` | Yes | HTTP listen port |
| `LOG_LEVEL` | `info` | Yes | Pino log level |
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/tiklive_comments` | Yes | Postgres connection string |
| `NATS_URL` | `nats://localhost:4222` | Yes | NATS JetStream broker URL |
| `JWT_SECRET` | — | Yes | Shared JWT secret |
| `COMMENT_POLL_INTERVAL_MS` | `2000` | Yes | How often (ms) to poll platform APIs for new comments |
| `CORRELATION_ID_HEADER` | `x-correlation-id` | Yes | Correlation ID header |
| `TRACE_ID_HEADER` | `x-trace-id` | Yes | Trace ID header |

---

### Notifications — `services/notifications/.env`

Port: **3007**

| Variable | Default | Required | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | Yes | Runtime environment |
| `PORT` | `3007` | Yes | HTTP listen port |
| `LOG_LEVEL` | `info` | Yes | Pino log level |
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/tiklive_notifications` | Yes | Postgres connection string |
| `NATS_URL` | `nats://localhost:4222` | Yes | NATS JetStream broker URL |
| `JWT_SECRET` | — | Yes | Shared JWT secret |
| `CORRELATION_ID_HEADER` | `x-correlation-id` | Yes | Correlation ID header |
| `TRACE_ID_HEADER` | `x-trace-id` | Yes | Trace ID header |

---

### Analytics — `services/analytics/.env`

Port: **3008**

| Variable | Default | Required | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | Yes | Runtime environment |
| `PORT` | `3008` | Yes | HTTP listen port |
| `LOG_LEVEL` | `info` | Yes | Pino log level |
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/tiklive_analytics` | Yes | Postgres connection string |
| `NATS_URL` | `nats://localhost:4222` | Yes | NATS JetStream broker URL |
| `JWT_SECRET` | — | Yes | Shared JWT secret |
| `CORRELATION_ID_HEADER` | `x-correlation-id` | Yes | Correlation ID header |
| `TRACE_ID_HEADER` | `x-trace-id` | Yes | Trace ID header |

---

### Stream Orchestrator — `services/stream-orchestrator/.env`

Port: **3009**

| Variable | Default | Required | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | Yes | Runtime environment |
| `PORT` | `3009` | Yes | HTTP listen port |
| `LOG_LEVEL` | `debug` | Yes | Pino log level |
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/tiklive_sessions` | Yes | Shares the live-session Postgres database |
| `NATS_URL` | `nats://localhost:4222` | Yes | NATS JetStream broker URL |
| `RTMP_INGEST_HOST` | `0.0.0.0` | Yes | RTMP ingest bind address |
| `RTMP_INGEST_PORT` | `1935` | Yes | RTMP ingest port |
| `INTEGRATIONS_SERVICE_URL` | `http://localhost:3005` | Yes | Internal URL to fetch decrypted OAuth tokens |
| `TIKTOK_CLIENT_KEY` | — | Yes | TikTok client key (for stream key generation) |
| `TIKTOK_CLIENT_SECRET` | — | Yes | TikTok client secret |
| `FACEBOOK_APP_ID` | — | Yes | Facebook app ID (for stream key generation) |
| `FACEBOOK_APP_SECRET` | — | Yes | Facebook app secret |

---

## App environment variables

### Web — `apps/web/.env`

| Variable | Default | Required | Description |
|---|---|---|---|
| `NEXTAUTH_URL` | `http://localhost:3010` | Yes | Canonical URL of the Next.js app. Must be the exact URL users access. |
| `NEXTAUTH_SECRET` | — | Yes | NextAuth encryption secret. Generate with `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | — | No | Google OAuth client ID (social login) |
| `GOOGLE_CLIENT_SECRET` | — | No | Google OAuth client secret |
| `FACEBOOK_APP_ID` | — | No | Facebook app ID (social login) |
| `FACEBOOK_APP_SECRET` | — | No | Facebook app secret |
| `TIKTOK_CLIENT_KEY` | — | No | TikTok client key (social login) |
| `TIKTOK_CLIENT_SECRET` | — | No | TikTok client secret |
| `AUTH_SERVICE_INTERNAL_URL` | `http://localhost:3001` | Yes | Server-side URL for the Auth service (used by NextAuth API routes) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | Yes | Public API Gateway URL (used by client-side code) |
| `NEXT_PUBLIC_COMMENTS_WS_URL` | `http://localhost:3006` | Yes | WebSocket URL for the Comments service real-time feed |

> Variables prefixed `NEXT_PUBLIC_` are embedded in the client-side bundle at build time. Never put secrets in `NEXT_PUBLIC_` variables.

---

### Mobile — `apps/mobile/.env`

| Variable | Default | Required | Description |
|---|---|---|---|
| `API_URL` | `http://10.0.2.2:3000` | Yes | API Gateway URL. Use `http://10.0.2.2:3000` for Android emulator, `http://localhost:3000` for iOS simulator, or your machine's local IP for physical devices. |
| `GOOGLE_CLIENT_ID` | — | No | Google OAuth client ID |
| `FACEBOOK_APP_ID` | — | No | Facebook app ID |
| `TIKTOK_CLIENT_KEY` | — | No | TikTok client key |
| `TIKTOK_CLIENT_SECRET` | — | No | TikTok client secret |

---

## OAuth credentials

### TikTok

1. Go to [TikTok for Developers](https://developers.tiktok.com/) and create an app.
2. Enable the **Login Kit** and **Live** products.
3. Add the OAuth redirect URI: `http://localhost:3005/integrations/oauth/tiktok/callback` (dev) or `https://api.tiklive.pro/integrations/oauth/tiktok/callback` (prod).
4. Copy **Client Key** → `TIKTOK_CLIENT_KEY` and **Client Secret** → `TIKTOK_CLIENT_SECRET` in both `services/integrations/.env` and `services/stream-orchestrator/.env`.

### Facebook

1. Go to [Meta for Developers](https://developers.facebook.com/) and create an app of type **Business**.
2. Add the **Facebook Login** product and enable the **Live Videos** permission.
3. Add the OAuth redirect URI: `http://localhost:3005/integrations/oauth/facebook/callback` (dev) or `https://api.tiklive.pro/integrations/oauth/facebook/callback` (prod).
4. Copy **App ID** → `FACEBOOK_APP_ID` and **App Secret** → `FACEBOOK_APP_SECRET` in both `services/integrations/.env` and `services/stream-orchestrator/.env`.

### Google (web social login only)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** for a Web application.
3. Add `http://localhost:3010/api/auth/callback/google` as an authorized redirect URI.
4. Copy the client ID and secret into `apps/web/.env`.

---

## Stripe setup

1. Create a [Stripe](https://stripe.com) account and retrieve your **secret key** from the Dashboard → Developers → API keys.
2. Create a **Product** with a recurring **Price** for the Premium plan. Copy the Price ID (`price_…`) → `STRIPE_PREMIUM_PRICE_ID`.
3. Set up a **Webhook** endpoint pointing to `https://api.tiklive.pro/billing/webhooks/stripe`. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
4. For local development, use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward events: `stripe listen --forward-to localhost:3004/billing/webhooks/stripe`.

---

## Port reference

| Service | Port |
|---|---|
| api-gateway | 3000 |
| auth | 3001 |
| users | 3002 |
| live-session | 3003 |
| billing | 3004 |
| integrations | 3005 |
| comments | 3006 |
| notifications | 3007 |
| analytics | 3008 |
| stream-orchestrator | 3009 |
| web (Next.js) | 3010 |
| NATS | 4222 |
| Postgres | 5432 |
| Redis | 6379 |
| RTMP ingest | 1935 |

---

## Production checklist

- [ ] All `JWT_SECRET` values are identical across every service and are at least 64 characters
- [ ] `TOKEN_ENCRYPTION_KEY` is exactly 32+ characters and stored in a secrets manager
- [ ] `NODE_ENV=production` in every service
- [ ] `NEXTAUTH_URL` matches the exact public URL of the web app
- [ ] `NEXT_PUBLIC_API_URL` points to the production API Gateway
- [ ] Stripe keys are `sk_live_…` (not `sk_test_…`)
- [ ] OAuth redirect URIs in TikTok and Facebook developer portals match `OAUTH_REDIRECT_BASE_URL`
- [ ] No `.env` files with real secrets are committed to the repository
