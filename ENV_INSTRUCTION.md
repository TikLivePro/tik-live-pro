# TikLivePro Environment Configuration Guide

Welcome to the TikLivePro environment configuration guide. This document explains where and how to configure environment variables for all microservices, the web application, and the mobile application.

---

## 🗺️ Workspace Port Map & Service Registry

All microservices are built with a unified configuration layout extending from a shared package (`@tik-live-pro/config`). In development, they run locally and bind to specific ports.

Ensure the ports below are correctly mapped in your active `.env` files to avoid port conflicts and communication errors:

| Service Directory                  | Service Name        |          Default Port          | Description / Responsibilities                             |
| :--------------------------------- | :------------------ | :----------------------------: | :--------------------------------------------------------- |
| **`apps/web`**                     | Web Application     |        `3000` (Next.js)        | Customer web portal & dashboard                            |
| **`apps/mobile`**                  | Mobile Application  |         Metro Bundler          | React Native app (iOS/Android)                             |
| **`services/api-gateway`**         | API Gateway         |             `3000`             | Single public gateway proxy for HTTP traffic               |
| **`services/auth`**                | Auth Service        |             `3001`             | Authentication, registration, and session token generation |
| **`services/users`**               | Users Service       |             `3002`             | Profile management and user metadata updates               |
| **`services/live-session`**        | Live Session        |             `3003`             | Core streaming session lifecycle transitions               |
| **`services/billing`**             | Billing Service     |             `3004`             | Stripe webhook processing & entitlements resolver          |
| **`services/integrations`**        | Integrations        |             `3005`             | OAuth account links & secure social token storage          |
| **`services/comments`**            | Comments Service    |             `3006`             | Multi-platform comments pollers & real-time WS stream      |
| **`services/notifications`**       | Notifications       |             `3007`             | Consumes events to emit in-app notifications               |
| **`services/analytics`**           | Analytics Service   |             `3008`             | Aggregates and serves stream performance data              |
| **`services/stream-orchestrator`** | Stream Orchestrator | `3009` (HTTP)<br>`1935` (RTMP) | Manages FFmpeg workers & ingests RTMP video feeds          |

---

## ⚙️ Base Environment Schemas (`baseEnvSchema`)

Every single backend microservice imports and extends a base validation schema located in `packages/config/src/env.ts` using `zod`. These base parameters exist in all services' environment files:

- `NODE_ENV`: Runs environment validations. Allowed values: `development`, `test`, `production` (Defaults to `development`).
- `LOG_LEVEL`: Logger verbosity. Allowed values: `trace`, `debug`, `info`, `warn`, `error` (Defaults to `info`).
- `PORT`: HTTP server listening port (Defaults to `3000`, must be set per service).
- `NATS_URL`: Event broker address (Defaults to `nats://localhost:4222`).
- `CORRELATION_ID_HEADER`: Request correlation header name (Defaults to `x-correlation-id`).
- `TRACE_ID_HEADER`: Request tracing header name (Defaults to `x-trace-id`).

---

## 📂 Step-by-Step Configuration per Service

To configure a service, locate its directory, copy the template `.env.example` to `.env`, and fill out the details:

### 1. Mobile App (`apps/mobile`)

- **File location**: `apps/mobile/.env`
- **Command**: `cp apps/mobile/.env.example apps/mobile/.env`
- **Variables**:
  - `API_URL`: Points to the API Gateway. Use `http://10.0.2.2:3000` for Android emulators, `http://localhost:3000` for iOS simulators, or your machine's local IP for physical devices.
  - `GOOGLE_CLIENT_ID`: App Client ID configured in your Google Developer console.
  - `FACEBOOK_APP_ID`: App ID configured in your Meta Developer portal.
  - `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`: App credentials from the TikTok Creator developer portal.

### 2. Web App (`apps/web`)

- **File location**: `apps/web/.env`
- **Command**: `cp apps/web/.env.example apps/web/.env`
- **Variables**:
  - `NEXTAUTH_URL`: Your local web dashboard endpoint (`http://localhost:3000`).
  - `NEXTAUTH_SECRET`: Random 32-character string. Generate with: `openssl rand -base64 32`
  - `NEXT_PUBLIC_API_URL`: Path to the API Gateway (`http://localhost:3000`).
  - `NEXT_PUBLIC_COMMENTS_WS_URL`: Path to the comments service WebSocket endpoint (`http://localhost:3006`).
  - OAuth client IDs and secrets matching those in your developer portals.

### 3. API Gateway (`services/api-gateway`)

- **File location**: `services/api-gateway/.env`
- **Command**: `cp services/api-gateway/.env.example services/api-gateway/.env`
- **Variables**:
  - `JWT_SECRET`: The shared key used to sign and verify user JWTs (must match the auth service).
  - `*_SERVICE_URL`: Downstream URLs for routing client requests to individual services (e.g. `http://localhost:3001` through `http://localhost:3008`).

### 4. Auth Service (`services/auth`)

- **File location**: `services/auth/.env`
- **Command**: `cp services/auth/.env.example services/auth/.env`
- **Variables**:
  - `DATABASE_URL`: Connection string for PostgreSQL auth database.
  - `JWT_SECRET`: Shared JWT signing key. Must be a secure, random string at least 64 characters long in production.
  - `JWT_ACCESS_EXPIRES_IN`: Access token validity time (e.g. `15m`).
  - `JWT_REFRESH_EXPIRES_IN`: Refresh token validity time (e.g. `30d`).

### 5. Integrations Service (`services/integrations`)

- **File location**: `services/integrations/.env`
- **Command**: `cp services/integrations/.env.example services/integrations/.env`
- **Variables**:
  - `OAUTH_REDIRECT_BASE_URL`: Root URL used to generate OAuth redirect addresses (e.g., `http://localhost:3005`).
  - `TOKEN_ENCRYPTION_KEY`: A secure **32-character key** used to encrypt user social platform tokens at rest (AES-256-GCM). Keep this extremely secure!
  - Social platform App IDs, Client Keys, and Secrets.

### 6. Billing Service (`services/billing`)

- **File location**: `services/billing/.env`
- **Command**: `cp services/billing/.env.example services/billing/.env`
- **Variables**:
  - `STRIPE_SECRET_KEY`: Stripe API secret key (prefixed with `sk_`).
  - `STRIPE_WEBHOOK_SECRET`: Secret used to sign events sent by Stripe (prefixed with `whsec_`).
  - `STRIPE_PREMIUM_PRICE_ID`: Product Price ID of your Premium subscription tier.

### 7. Other Services (`users`, `live-session`, `comments`, `notifications`, `analytics`, `stream-orchestrator`)

- **File locations**: `services/<service-name>/.env`
- **Commands**: `cp services/<service-name>/.env.example services/<service-name>/.env`
- Set their respective `DATABASE_URL` configurations (each microservice uses its own schema or isolated database) and ensure their `JWT_SECRET` keys match the one configured in `services/auth`.

---

## ⚡ Fast Setup Script (Developer Cheat Sheet)

If you are setting up local development for the first time, you can execute this bash script from the root directory to instantly populate `.env` files with working defaults:

```bash
#!/usr/bin/env bash

# Copy examples to active environments
cp apps/mobile/.env.example apps/mobile/.env
cp apps/web/.env.example apps/web/.env
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

echo "✅ All 12 configuration (.env) files successfully initialized!"
echo "⚠️  Remember to fill in your OAuth Secrets and Stripe API tokens in respective files."
```

## 🔒 Security Best Practices

1.  **Never commit active `.env` files**: All directories are pre-configured to ignore `.env` files via `.gitignore`.
2.  **Shared JWT Key**: Keep the `JWT_SECRET` synchronized between the `auth`, `api-gateway`, and any microservice validating auth tokens (e.g. `users`, `live-session`, `integrations`, `billing`, `comments`, `notifications`, `analytics`).
3.  **Token Encryption Key**: Do not lose or change the `TOKEN_ENCRYPTION_KEY` in the integrations service once it has encrypted users' tokens, otherwise stored credentials will become unreadable and users will need to re-authenticate their social accounts.
