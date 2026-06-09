> Last updated: 2026-06-09

# Facebook OAuth — Live Video Setup (complete guide)

This guide covers the full Facebook app configuration for TikLivePro's `integrations` service, which handles live streaming to Facebook Pages. It is separate from the auth guide (`facebook-credentials.md`), which only covers user login.

---

## Why this error?

```
Invalid Scopes: publish_video, pages_manage_posts,
pages_read_engagement, pages_show_list.
```

This error means the permissions you are requesting have **not yet been declared** in your Meta dashboard. Facebook requires every permission to be explicitly added to your app before it can be requested in the OAuth flow — even in development mode. This is not an App Review issue; it is a mandatory configuration step.

---

## OAuth flow overview

```
1. User clicks "Connect Facebook"
        ↓
2. GET /integrations/oauth/facebook/start
   → generates a CSRF state token, stored in DB
   → builds the Facebook authorization URL
        ↓
3. Redirect to Facebook Consent Screen
   (user approves the requested permissions)
        ↓
4. Facebook calls back → GET /integrations/oauth/facebook/callback?code=…&state=…
   → validates the CSRF state token
   → exchanges the code for an access token (Graph API)
   → fetches the user profile
   → stores the AES-256-GCM encrypted token in the DB
   → publishes the NATS event integration.account.connected
        ↓
5. Redirect to /settings?connected=facebook
   → frontend invalidates the social-accounts query
   → connected accounts list refreshes
```

---

## Step 1 — Create a Meta app of type "Business"

> If you already have an existing app (used for login), **do not reuse it** for Live Video. The use cases are different and Facebook manages them separately. Create a second app.

1. Go to [developers.facebook.com](https://developers.facebook.com) and log in.
2. Click **My Apps → Create App**.
3. Select **Other** (at the bottom of the list) as the use case, then click **Next**.
4. Choose the type **Business**, then **Next**.
5. Fill in the form:

   | Field | Value |
   |---|---|
   | **App name** | `TikLivePro Live` (or any name) |
   | **App contact email** | Your developer email |
   | **Business account** | Optional in development |

6. Click **Create app**. The app is created in **Development** mode.

---

## Step 2 — Add the "Facebook Login" product

1. In the left sidebar, click **Add a product**.
2. Find **Facebook Login** and click **Set up**.
3. Choose **Web** as the platform.
4. Enter your site URL:
   - Development: `http://localhost:3005`
   - Production: `https://tiklivepro.me`
5. Click **Save** then **Continue**.

---

## Step 3 — Configure OAuth redirect URIs

1. In the left sidebar, go to **Facebook Login → Settings**.
2. In the **Valid OAuth redirect URIs** field, add:

   **Local development:**
   ```
   http://localhost:3005/integrations/oauth/facebook/callback
   ```

   **Production:**
   ```
   https://tiklivepro.me/integrations/oauth/facebook/callback
   ```

   > ⚠️ The URI must match **exactly** what is set in `OAUTH_REDIRECT_BASE_URL` in your `.env`, followed by `/integrations/oauth/facebook/callback`. Any difference (protocol, port, path) causes a `redirect_uri_mismatch` error.

3. Disable **Client OAuth Login** if it is enabled (not needed for a server-side flow).
4. Click **Save changes**.

---

## Step 4 — Declare the required permissions

This is the step that fixes the `Invalid Scopes` error. Permissions must be **declared in the app** before they can be requested in the OAuth flow.

1. In the left sidebar, go to **App Review → Permissions and Features**.
2. Search for and add each of the following permissions by clicking **Add**:

   | Permission | Why TikLivePro needs it | Level |
   |---|---|---|
   | `pages_show_list` | List the Pages managed by the user (for the Page selector) | Standard |
   | `pages_manage_posts` | Create a live video on a Page | Advanced |
   | `pages_read_engagement` | Read comments in real time during the stream | Advanced |

   > `publish_video` is **not** needed to stream to a Facebook Page. That permission applies to a user's personal timeline. For Pages (the professional use case), use `pages_manage_posts` with a **Page access token**.

3. After adding each permission, its status becomes **Pending review** (in production) or **Available for testing** (in development mode).

---

## Step 5 — Add test users

In **Development** mode, only accounts with a role on the app can complete the OAuth flow.

1. In the left sidebar, go to **Roles → Test users**.
2. Click **Add test users**.
3. Create a new test user **or** add an existing Facebook account by username.
4. That user can now:
   - Connect their Facebook account via TikLivePro
   - Approve permissions in development mode
   - Stream live to their Pages (if Pages are associated with the test account)

> To add your own Facebook account as an administrator (full access): **Roles → Roles → Add administrators**.

---

## Step 6 — Retrieve the credentials

1. In the left sidebar, go to **App settings → Basic**.
2. Copy the two values at the top of the page:

   | Portal label | Environment variable |
   |---|---|
   | **App ID** | `FACEBOOK_APP_ID` |
   | **App secret** | `FACEBOOK_APP_SECRET` |

   The app secret is hidden by default — click **Show** and re-enter your Facebook password to reveal it.

---

## Step 7 — Configure environment variables

### Integrations service (`services/integrations/.env`)

```env
# Facebook Live Video credentials
FACEBOOK_APP_ID=123456789012345
FACEBOOK_APP_SECRET=abcdef1234567890abcdef1234567890

# Base URL of the integrations service (for the OAuth callback)
OAUTH_REDIRECT_BASE_URL=http://localhost:3005

# Frontend URL (redirect after the OAuth callback)
FRONTEND_URL=http://localhost:3010
```

> `OAUTH_REDIRECT_BASE_URL` must point to the `integrations` service (port 3005 locally), **not** the frontend. This is the URL that Facebook calls for the callback.

### Quick verification

```bash
# Test that the /start endpoint responds with a Facebook authUrl
curl -s -H "Authorization: Bearer <your_jwt>" \
  http://localhost:3005/integrations/oauth/facebook/start | jq .

# Expected response:
# {
#   "data": {
#     "authUrl": "https://www.facebook.com/v21.0/dialog/oauth?client_id=..."
#   }
# }
```

---

## Step 8 — Test the full flow in development

### Prerequisites

- The `integrations` service is running (`pnpm dev` or `pnpm --filter integrations dev`)
- Local infrastructure is up (`pnpm docker:dev`)
- The Facebook account being tested has a role on the Meta app

### Procedure

1. Log in to TikLivePro with your account.
2. Go to **Settings → Connected accounts**.
3. Click **Connect Facebook**.
4. You are redirected to the Facebook consent screen.
5. Accept the requested permissions.
6. Facebook sends you back to `http://localhost:3005/integrations/oauth/facebook/callback?code=…&state=…`.
7. The service exchanges the code, encrypts the token, and saves the account in the database.
8. You are redirected to `http://localhost:3010/settings?connected=facebook`.
9. A "Facebook account connected" toast appears and the account list refreshes.

---

## Going to production (App Review)

The `pages_manage_posts` and `pages_read_engagement` permissions are **advanced permissions** that require Meta review before they can be used by all your users.

### What Meta evaluates

- Your app clearly explains why it needs each permission
- You provide a demo video of the full flow
- Your privacy policy is publicly accessible
- Your domain is verified in the Meta Business Manager

### Submission steps

1. In **App Review → Permissions and Features**, click **Request advanced access** for `pages_manage_posts` and `pages_read_engagement`.
2. For each permission, fill in:
   - **Usage description**: explain precisely how TikLivePro uses this permission
   - **Screenshot or video**: show the OAuth flow and the live video creation
3. Fill in your **Privacy Policy** and **Terms of Service URL** in **App settings → Basic**.
4. Verify your domain in **Business Settings → Brand Safety → Domains**.
5. Submit. Meta typically responds within 5–10 business days.

### Switching to Live mode

1. In the portal top bar, toggle the mode from **Development → Live**.
2. ⚠️ In Live mode, **all Facebook users** can use the app (not just testers). Only switch to Live mode after Meta has approved your advanced permissions.

---

## Permissions — summary

| Permission | Usage in TikLivePro | OAuth flow | App Review required |
|---|---|---|---|
| `pages_show_list` | List the user's Pages for the Page selector | Standard | No |
| `pages_manage_posts` | Create a live video via `POST /{page_id}/live_videos` | Advanced | Yes (production) |
| `pages_read_engagement` | Read comments via `GET /{live_video_id}/comments` | Advanced | Yes (production) |
| `publish_video` | ~~Stream to personal timeline~~ | — | Not used |

> TikLivePro streams **exclusively to Pages** (professional use case). `publish_video` is not requested because it targets personal timelines.

---

## Page access token vs user access token

The Facebook Graph API distinguishes two types of tokens for Page operations:

| Token | Scope | When to use |
|---|---|---|
| **User access token** | Operations on the user's personal account | Not suited for Pages |
| **Page access token** | Operations on a specific Page | ✅ Creating live videos, reading comments |

### Obtaining a Page access token

After retrieving the user access token during the OAuth callback:

```
GET /me/accounts?access_token={user_token}
```

Response:
```json
{
  "data": [
    {
      "id": "123456789",
      "name": "My Page",
      "access_token": "<page_access_token>",
      "category": "Brand",
      "tasks": ["ADVERTISE", "ANALYZE", "CREATE_CONTENT", "MODERATE"]
    }
  ]
}
```

The `page_access_token` is then used for:
```
POST /{page_id}/live_videos
Authorization: {page_access_token}
```

> **Architecture note**: the current `FacebookAdapter.createLiveStream` implementation uses the user token with `/me`. For Pages, the adapter needs to be extended to store and use the Page access token. See [Future improvements](#future-improvements).

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Invalid Scopes: pages_manage_posts, …` | Permissions not declared in the Meta portal | Add each permission in **App Review → Permissions and Features** |
| `redirect_uri_mismatch` | The callback URI does not match the registered one | Verify that `OAUTH_REDIRECT_BASE_URL` + `/integrations/oauth/facebook/callback` is listed in **Facebook Login → Settings → Valid OAuth Redirect URIs** |
| `App Not Set Up` | App is in Development mode and the user has no role | Add the user in **Roles → Test users** |
| `(#200) The user hasn't authorized the application` | Page token missing or expired (60 days) | Re-run the OAuth flow |
| `(#10) Application does not have permission for this action` | Permission not approved by Meta in Live mode | Submit the permission for App Review |
| `Invalid OAuth access token` | Token expired or revoked | Facebook tokens (without refresh) expire after 60 days — the user must reconnect |
| `state mismatch` (server-side) | CSRF state expired (> 15 min) or already consumed | Restart the flow from the beginning |
| Error toast but no redirect | Exception in the callback — check integrations service logs | Run `pnpm --filter integrations dev` and watch the JSON logs |

---

## Future improvements

- **Page selector**: after the callback, let the user choose which Page to use for streaming (via `GET /me/accounts`), then store the Page access token separately.
- **Automatic token refresh**: Facebook tokens expire after 60 days. Implement `GET /oauth/access_token?grant_type=fb_exchange_token` to exchange a short-lived token for a long-lived one (valid 60 days), then notify the user before expiry.
- **Comment webhooks**: replace polling (`FacebookAdapter.pollComments`) with a webhook on `live_videos` → `comments` field, more efficient at scale.

---

## References

- [Facebook Login Permissions](https://developers.facebook.com/docs/facebook-login/permissions)
- [Live Video API](https://developers.facebook.com/docs/live-video-api)
- [Page Access Tokens](https://developers.facebook.com/docs/pages/access-tokens)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/) — to test API calls manually
- [App Review](https://developers.facebook.com/docs/app-review)
