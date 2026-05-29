> Last updated: 2026-05-29

# TikTok Credentials Setup

This guide walks through obtaining `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` from the TikTok developer portal for social login.

---

## 1. Create a TikTok developer account

1. Go to [developers.tiktok.com](https://developers.tiktok.com).
2. Click **Log in** in the top-right corner and sign in with a TikTok account.
3. If prompted, agree to the **TikTok for Developers Terms of Service**.

---

## 2. Create an app

1. From the developer portal home, click **Manage apps** in the top navigation.
2. Click **Connect an app** (top-right).
3. Fill in the form:

   | Field | Value |
   |---|---|
   | **App name** | `TikLivePro` (or any name) |
   | **App description** | Brief description of your platform |
   | **App category** | `Entertainment` |
   | **Platform** | `Web` |

4. Click **Submit** to create the app. It starts in **Sandbox** mode — credentials are usable immediately without approval.

---

## 3. App description (120-character limit)

TikTok requires a short description of your app (max 120 characters). Use the following:

```
Stream live to TikTok & Facebook at once, view aggregated comments, and manage your social accounts in one platform.
```

*(118 characters)*

---

## 4. Verify your domain via DNS TXT record

TikTok requires you to prove ownership of `tiklivepro.me` before allowing it as a redirect URI in production.

1. In the developer portal, go to your app → **App info** → **Domain verification** (or the **Redirect URIs** section — the verification prompt appears there).
2. TikTok displays a TXT record value such as:
   ```
   tiktok-developers-site-verification=<unique-token>
   ```
3. Log in to your DNS provider (where `tiklivepro.me` is managed — e.g. Namecheap, Cloudflare, GoDaddy).
4. Add a new **TXT** record:

   | Field | Value |
   |---|---|
   | **Type** | `TXT` |
   | **Host / Name** | `@` (root domain) |
   | **Value** | The full string TikTok gave you |
   | **TTL** | 3600 (or default) |

5. Save the record, then click **Verify** in the TikTok portal.

> **Note:** DNS propagation can take a few minutes to several hours. If verification fails immediately, wait 30 minutes and try again.

You can check that the record is live before clicking Verify:
```bash
dig TXT tiklivepro.me +short
```
The output should include the TikTok verification string.

---

## 5. Enable Login Kit

Login Kit is required for the social login (`TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` used in `apps/web` and `apps/mobile`).

1. Inside your app, go to the **Products** tab.
2. Find **Login Kit** and click **Add**.
3. Under **Redirect URIs**, add:

   ```
   # Local development
   http://localhost:3010/api/auth/callback/tiktok

   # Production
   https://<your-domain>/api/auth/callback/tiktok
   ```

4. Click **Save**.

> **Note:** TikTok validates redirect URIs strictly. The URI in your `.env` must match exactly — including the protocol, host, port, and path.

---

## 6. TikTok LIVE streaming — how it actually works

> **Important:** TikTok does **not** have a public Live API in the developer portal. There is no "Live Kit" product, and no `live.stream.*` or `live.comment.*` scopes exist in the official developer portal. Live streaming and live comment access work through separate, non-portal mechanisms described below.

### 6a. RTMP stream key (broadcasting)

TikTok LIVE streaming uses RTMP, but stream keys are **not** obtained via the developer API. The flow is:

1. The connected TikTok account must be part of a **TikTok Creator Network** (agency). Creator Networks unlock the RTMP option — there is no follower minimum for many networks and membership is free.
2. Once unlocked, the creator visits **TikTok LIVE Producer** at `livecenter.tiktok.com/producer` to generate a stream key.
3. A **new stream key is issued each session** — it cannot be retrieved programmatically via an official API.

**Implication for TikLivePro:** The app must instruct users to copy their stream key from TikTok LIVE Producer and paste it into the platform, or TikLivePro must pursue a direct **TikTok partnership** to obtain keys on behalf of users.

### 6b. Live comments and interactions

TikTok does **not** expose a public API for live comment data. Comments, gifts, and viewer counts during a live are delivered via TikTok's internal **WebCast** service (a signed WebSocket). Accessing it requires:

- A **signature server** that generates TikTok's required signed parameters (`msToken`, `X-Bogus`).
- A third-party service or self-hosted solution:

  | Service | Type | Notes |
  |---|---|---|
  | [Euler Stream](https://www.eulerstream.com/) | Paid managed API | Handles WebCast + signature server; recommended |
  | [Tik.Tools](https://tik.tools/) | Paid managed API | Agency-focused, also covers WebCast |
  | [TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector) | Open-source (Node.js) | Requires a paid signature server backend |

**Implication for TikLivePro:** The `comments` service must integrate with one of these services rather than calling a TikTok developer portal API directly.

### 6c. Reactions

TikTok provides no API for live reactions (hearts, etc.). Reactions are viewer-driven on TikTok's side only and cannot be read or triggered programmatically.

### Full product checklist (developer portal)

| Product | Required for |
|---|---|
| **Login Kit** | OAuth account connection (`user.info.basic`) |
| *(no other portal product)* | Live streaming and comments are handled outside the developer portal — see 6a and 6b |

---

## 7. Get your credentials

1. Go to the **App info** tab of your app.
2. Copy the two values:

   | Portal label | Environment variable |
   |---|---|
   | **Client key** | `TIKTOK_CLIENT_KEY` |
   | **Client secret** | `TIKTOK_CLIENT_SECRET` |

   The client secret is hidden by default — click the eye icon to reveal it.

---

## 8. Add the credentials to your environment files

### Web app (`apps/web/.env`)

```env
TIKTOK_CLIENT_KEY=your_client_key_here
TIKTOK_CLIENT_SECRET=your_client_secret_here
```

### Mobile app (`apps/mobile/.env`)

```env
TIKTOK_CLIENT_KEY=your_client_key_here
TIKTOK_CLIENT_SECRET=your_client_secret_here
```

---

## 9. Sandbox vs. production

| | Sandbox | Production |
|---|---|---|
| **Approval required** | No | Yes |
| **Test users** | Only whitelisted TikTok accounts | Any TikTok account |
| **Credentials** | Same client key/secret | Same client key/secret |
| **How to switch** | — | Submit app for review in the portal |

To add test accounts in Sandbox mode:

1. Go to **Sandbox** → **Test accounts** in your app.
2. Enter the TikTok username of the account to whitelist.
3. That account can now complete the OAuth login flow during development.

When you are ready for production:

1. Go to **Submit for review** in your app.
2. Complete the compliance questionnaire and provide demo videos of the login flow.
3. TikTok typically reviews within 3–5 business days.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` | The redirect URI in the OAuth request does not match what is registered | Add the exact URI under **Login Kit → Redirect URIs** in the portal |
| `invalid_client` | Wrong client key or secret | Re-copy the values from **App info** — watch for trailing spaces |
| `access_denied` | User denied permission or account is not whitelisted | In Sandbox, add the account to **Test accounts** |
| Login button does nothing | Missing or empty env vars | Confirm `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` are set and the dev server was restarted after editing `.env` |

---

## 10. Configure Webhooks (Callback URL)

TikTok can push events to TikLivePro instead of waiting for the app to poll. Set this up once in the developer portal after your domain is verified.

### Why configure webhooks

| Without webhooks | With webhooks |
|---|---|
| App only knows a user revoked access when an API call fails during a live session | TikTok notifies immediately → account marked inactive proactively |
| Comments fetched every 2 s regardless of activity | (Future) real-time comment push replaces polling |
| App never knows if TikTok force-ends a session | `live.session.ended` event triggers graceful session teardown |

### Supported webhook events

| Event | What triggers it | What TikLivePro does |
|---|---|---|
| `user.authorization.revoke` | User removes your app from their TikTok privacy settings | Marks the social account `isActive: false` in the DB; publishes `integration.account.disconnected` (reason: `platform_revoked`) |
| `live.session.ended` | TikTok force-terminates a live session | Publishes `integration.platform.session_ended`; `live-session` service handles teardown |

### Portal setup

1. In the developer portal, open your app and go to the **Webhooks** (or **Event Subscriptions**) tab.
2. Set the **Callback URL** to:

   ```
   # Production
   https://tiklivepro.me/integrations/webhooks/tiktok

   # Local dev (requires a tunnel — see below)
   https://<your-tunnel>.ngrok.io/integrations/webhooks/tiktok
   ```

3. Select the events to subscribe to:
   - `user.authorization.revoke`
   - `live.session.ended`

4. Click **Save**. TikTok will immediately send a `GET` request with `?challenge=<token>` to verify the URL. The integrations service echoes the token back automatically — no action needed.

### Local dev with ngrok

TikTok cannot reach `localhost`. Use [ngrok](https://ngrok.com) to expose port 3005:

```bash
ngrok http 3005
# Copy the HTTPS forwarding URL, e.g. https://abc123.ngrok.io
# Set Callback URL: https://abc123.ngrok.io/integrations/webhooks/tiktok
```

### How signature verification works

Every POST from TikTok includes a header:

```
X-TikTok-Signature: sha256=<hex_digest>
```

The integrations service computes `HMAC-SHA256(rawBody, TIKTOK_CLIENT_SECRET)` and compares using a timing-safe comparison. Requests with a missing or invalid signature are rejected with `400 INVALID_SIGNATURE`.

No additional environment variable is needed — `TIKTOK_CLIENT_SECRET` (already set) is used as the HMAC key.

---

## 11. App Review — required explanation (paste into the submission form)

> Copy the block below verbatim into the **"Explain how each product and scope works within your app or website"** field (996 characters, limit 1000).

---

TikLivePro lets creators stream live to TikTok and Facebook simultaneously from one dashboard.

Login Kit (user.info.basic): Used for OAuth account connection. After consent, we fetch open_id, display_name, and avatar_url to identify and display the linked account. Tokens are AES-256-GCM encrypted at rest and revoked on disconnect.

Note: TikTok does not expose a public Live API through the developer portal. Live streaming uses RTMP keys obtained by the creator from TikTok LIVE Producer (livecenter.tiktok.com/producer). Live comment data is accessed via TikTok's WebCast service through a third-party integration (e.g. Euler Stream), not via developer portal scopes.
