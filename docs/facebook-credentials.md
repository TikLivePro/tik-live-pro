> Last updated: 2026-06-07

# Facebook Credentials Setup

This guide walks through obtaining `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` from the Meta developer portal for social login.

---

## 1. Create a Meta developer account

1. Go to [developers.facebook.com](https://developers.facebook.com).
2. Click **Get Started** (top-right) and log in with a Facebook account.
3. If prompted, verify your account with a phone number and agree to the **Meta Platform Terms**.

---

## 2. Create an app

1. From the **My Apps** dashboard, click **Create App**.
2. Select the use case **Authenticate and request data from users with Facebook Login**, then click **Next**.
3. Fill in the form:

   | Field | Value |
   |---|---|
   | **App name** | `TikLivePro` (or any name) |
   | **App contact email** | Your developer email |

4. Click **Create app**. The app is created in **Development** mode — credentials work immediately without review.

---

## 3. Configure Facebook Login

1. Inside your app, go to **Use cases** in the left sidebar.
2. Find **Authenticate and request data from users with Facebook Login** and click **Customize**.

   The **Customize use case** page shows five sections:

   | # | Section | Action |
   |---|---------|--------|
   | 1 | **Tell us about your website** | Fill in your site URL — required |
   | 2 | Set up the Facebook SDK for JavaScript | **Skip** — not needed with NextAuth |
   | 3 | Check Login Status | **Skip** — handled server-side by NextAuth |
   | 4 | Add the Facebook Login Button | **Skip** — handled by NextAuth |
   | 5 | Next Steps | Optional reading |

   > TikLivePro uses NextAuth's server-side redirect OAuth flow (`FacebookProvider`). The Facebook JS SDK (steps 2–4) is only needed for apps that embed the login button directly in the browser via the SDK. You can ignore those sections entirely.

3. Under **Valid OAuth Redirect URIs**, add only your **production** URI:

   ```
   https://<your-domain>/api/auth/callback/facebook
   ```

   > **Local development:** Facebook automatically allows all `http://localhost` URIs in Development mode — you do **not** need to add `http://localhost:3010/api/auth/callback/facebook` to the list. The Check URI tool will show it as invalid (because it is not in the explicit list), but the OAuth flow still works locally.

4. Click **Save changes**.

> **Note:** Facebook validates redirect URIs strictly. The URI must match exactly — including protocol, host, port, and path.

> **Alternative location:** Depending on your app configuration, the **Valid OAuth Redirect URIs** field may not appear under **Use cases → Customize**. If you don't see it there, go to **Products → Facebook Login → Settings** in the left sidebar — the field is in both places but Meta's UI surfaces one or the other based on how the app was created.

> **Check URI tool:** After saving, you can use the **Check URI** input in the portal to validate a URI. If it shows a red cross, the URI is not yet in your saved list — confirm you clicked **Save changes** and wait a few seconds before re-checking. Note that localhost URIs will always show as invalid in this tool even though they work in practice during development.

---

## 4. Get your credentials

1. In the left sidebar, go to **App settings → Basic**.
2. Copy the two values at the top of the page:

   | Portal label | Environment variable |
   |---|---|
   | **App ID** | `FACEBOOK_APP_ID` |
   | **App secret** | `FACEBOOK_APP_SECRET` |

   The app secret is hidden by default — click **Show** and re-enter your Facebook password to reveal it.

---

## 5. Add the credentials to your environment files

### Web app (`apps/web/.env`)

```env
FACEBOOK_APP_ID=your_app_id_here
FACEBOOK_APP_SECRET=your_app_secret_here
```

### Mobile app (`apps/mobile/.env`)

```env
FACEBOOK_APP_ID=your_app_id_here
```

> The mobile app only needs `FACEBOOK_APP_ID`. The secret is never exposed to the client.

---

## 6. Development vs. production

| | Development mode | Live mode |
|---|---|---|
| **Approval required** | No | Yes (for most permissions) |
| **Test users** | Only Facebook accounts that have a role on the app | Any Facebook account |
| **Credentials** | Same App ID / App secret | Same App ID / App secret |
| **How to switch** | — | Toggle **Live** in the top bar of the portal |

To add test users in Development mode:

1. Go to **Roles → Test users** in the left sidebar.
2. Click **Add** and either create a new test user or add an existing Facebook account by username.
3. That account can now complete the OAuth login flow during development.

To go live:

1. Toggle the mode switch in the top bar from **Development** to **Live**.
2. If you request permissions beyond `email` and `public_profile`, submit those for **App Review** first.
3. Meta typically reviews within 5–7 business days.

---

## Data Deletion Callback

Meta requires that apps accessing user data provide a way for users to request deletion of their data. TikLivePro satisfies this with a **data deletion request callback URL**.

### How it works

1. A user goes to their Facebook settings and requests deletion of their data from TikLivePro.
2. Facebook POSTs a `signed_request` to `https://tiklivepro.me/api/auth/facebook/deletion`.
3. The Next.js route (`apps/web/src/app/api/auth/facebook/deletion/route.ts`) verifies the HMAC-SHA256 signature using `FACEBOOK_APP_SECRET`, extracts the Facebook user ID, and calls the auth service at `POST /auth/oauth/deletion`.
4. The auth service removes the `oauth_accounts` row linking that Facebook account to TikLivePro.
5. The route returns the required JSON response: `{ url, confirmation_code }` — the `url` points to `https://tiklivepro.me/data-deletion?code=<uuid>`, a confirmation page users can visit to verify the request was processed.

### Register the callback URL in the portal

**Step 1 — Add the domain to App Domains (required first)**

Facebook rejects any URL whose domain is not registered. Before saving the callback URL:

1. Go to **App settings → Basic** in the left sidebar.
2. Find the **App Domains** field.
3. Add `tiklivepro.me` (without protocol or path).
4. Click **Save changes**.

Without this step, saving any URL on `tiklivepro.me` will produce the error *"name_placeholder should represent a valid URL"*.

**Step 2 — Register the data deletion callback URL**

1. Stay on **App settings → Basic**.
2. Scroll down to find **Data Deletion Instructions URL**.
3. Enter: `https://tiklivepro.me/api/auth/facebook/deletion`
4. Click **Save changes**.

> **Local testing:** Facebook does not call localhost URLs for data deletion callbacks. Test the endpoint manually with a valid `signed_request` using the app secret from your local `.env`.

### Generate a test signed_request (local dev)

```bash
# Replace USER_ID and APP_SECRET with real values
node -e "
const crypto = require('crypto');
const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: 'USER_ID', issued_at: Math.floor(Date.now()/1000) })).toString('base64url');
const sig = crypto.createHmac('sha256', 'APP_SECRET').update(payload).digest('base64url');
console.log(sig + '.' + payload);
"

# Then POST it:
curl -X POST http://localhost:3010/api/auth/facebook/deletion \
  -F "signed_request=<output from above>"
```

---

## Webhooks

**You do not need to configure Webhooks for TikLivePro.**

The Webhooks section in the Meta portal is for apps that want Facebook to push events to an HTTP endpoint. TikLivePro uses a **polling** model instead: `CommentPoller` calls the Graph API on a timer and fetches new comments using cursor-based pagination (`FacebookAdapter.pollComments`). No webhook endpoint is required.

| Portal section | Required? | Why |
|---|---|---|
| **Webhooks** | No | TikLivePro polls the Graph API — no push endpoint needed |
| **Select product / Subscribe to changes** | No | Same reason |

If the polling approach is ever replaced with a push-based integration, a webhook endpoint would need to be added to the `comments` service and registered here, subscribing to the `live_videos` → `comments` field.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` | The redirect URI in the OAuth request does not match what is registered | Add the exact URI under **Facebook Login → Valid OAuth Redirect URIs** |
| Check URI shows red cross | URI not in the saved list | Add the URI and click **Save changes**; wait a few seconds then re-check |
| Valid OAuth Redirect URIs field missing | Field not visible under Use cases → Customize | Navigate to **Products → Facebook Login → Settings** instead |
| `invalid_client_id` | Wrong App ID | Re-copy the value from **App settings → Basic** |
| `Cannot load URL` (mobile) | App not configured for mobile platform | Go to **App settings → Basic** and add the iOS / Android platform |
| `User not authorized` | Account has no role on the app in Development mode | Add the account under **Roles → Test users** |
| Login button does nothing | Missing or empty env vars | Confirm `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are set and the dev server was restarted after editing `.env` |
| `App Not Set Up` error page | App is in Development mode and the user has no role | Add the user as a test user or switch the app to Live mode |
