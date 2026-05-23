> Last updated: 2026-05-23

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
3. Under **Valid OAuth Redirect URIs**, add:

   ```
   # Local development
   http://localhost:3010/api/auth/callback/facebook

   # Production
   https://<your-domain>/api/auth/callback/facebook
   ```

4. Click **Save changes**.

> **Note:** Facebook validates redirect URIs strictly. The URI must match exactly — including protocol, host, port, and path.

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

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` | The redirect URI in the OAuth request does not match what is registered | Add the exact URI under **Facebook Login → Valid OAuth Redirect URIs** |
| `invalid_client_id` | Wrong App ID | Re-copy the value from **App settings → Basic** |
| `Cannot load URL` (mobile) | App not configured for mobile platform | Go to **App settings → Basic** and add the iOS / Android platform |
| `User not authorized` | Account has no role on the app in Development mode | Add the account under **Roles → Test users** |
| Login button does nothing | Missing or empty env vars | Confirm `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are set and the dev server was restarted after editing `.env` |
| `App Not Set Up` error page | App is in Development mode and the user has no role | Add the user as a test user or switch the app to Live mode |
