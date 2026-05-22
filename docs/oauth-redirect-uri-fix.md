# Fix: OAuth `redirect_uri_mismatch` (Error 400)

## Symptom

> Vous ne pouvez pas vous connecter, car cette appli a envoyé une demande non valide.
> **Erreur 400 : redirect_uri_mismatch**

## Root Cause

NextAuth.js builds its callback URL from `NEXTAUTH_URL` (set in `apps/web/.env`).
For Google sign-in it sends:

```
http://localhost:3000/api/auth/callback/google
```

If that exact URI is not listed under **Authorized redirect URIs** in the Google Cloud Console, Google rejects the request with Error 400.

## Fix

### 1. Open Google Cloud Console

Go to **APIs & Services → Credentials** and click the OAuth 2.0 Client ID used by this project.

### 2. Add the redirect URI

Under **Authorized redirect URIs**, add:

| Environment | URI |
|-------------|-----|
| Local dev   | `http://localhost:3000/api/auth/callback/google` |
| Production  | `https://<your-domain>/api/auth/callback/google` |

Click **Save** and wait ~30 seconds for the change to propagate.

### 3. Verify `NEXTAUTH_URL` matches

`apps/web/.env`:

```env
NEXTAUTH_URL=http://localhost:3000   # must match the registered URI above
```

If you change the port or domain, update both the env var **and** the Google Console entry.

## How NextAuth builds the callback URL

```
{NEXTAUTH_URL}/api/auth/callback/{provider}
```

Examples:
- Google   → `http://localhost:3000/api/auth/callback/google`
- Facebook → `http://localhost:3000/api/auth/callback/facebook`
- TikTok   → `http://localhost:3000/api/auth/callback/tiktok`

Register a URI for each provider you enable.

## Related files

| File | Role |
|------|------|
| `apps/web/src/auth.ts` | NextAuth config — providers, callbacks |
| `apps/web/src/app/api/auth/[...nextauth]/route.ts` | NextAuth route handler |
| `apps/web/.env` | `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
