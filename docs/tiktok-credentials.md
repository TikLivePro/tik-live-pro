> Last updated: 2026-05-23

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

## 3. Enable Login Kit

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

## 4. Get your credentials

1. Go to the **App info** tab of your app.
2. Copy the two values:

   | Portal label | Environment variable |
   |---|---|
   | **Client key** | `TIKTOK_CLIENT_KEY` |
   | **Client secret** | `TIKTOK_CLIENT_SECRET` |

   The client secret is hidden by default — click the eye icon to reveal it.

---

## 5. Add the credentials to your environment files

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

## 6. Sandbox vs. production

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
