# Skill: Add a New Streaming Platform

This skill details how to integrate a new social streaming platform (e.g. YouTube, Twitch, Instagram) into the TikLivePro monorepo.

---

## Preconditions / Trigger Criteria

Use this skill when:
- The user requests to add support for a new social network.
- Building platform-specific authentication, RTMP endpoints, or comment polling.

---

## Detailed Implementation Steps

### 1. Register Platform Type

Add the new platform value in `packages/shared-types/src/social.types.ts`:
```typescript
export const SocialPlatform = {
  TIKTOK: 'tiktok',
  FACEBOOK: 'facebook',
  YOUR_PLATFORM: 'your_platform', // ← Register here
} as const;
```

---

### 2. Implement Platform Adapter

Create `packages/platform-adapters/src/platforms/<platform>/<Platform>Adapter.ts` implementing `IPlatformAdapter`:

| Method | Purpose |
|--------|---------|
| `exchangeCode(code, redirectUri)` | OAuth authorization code → tokens |
| `refreshTokens(refreshToken)` | Refresh expired access token |
| `revokeTokens(accessToken)` | Revoke platform access |
| `getUser(accessToken)` | Fetch user profile metadata |
| `createLiveStream(accessToken, title, description)` | Provision RTMP endpoint; return ingest URL + stream key |
| `endLiveStream(accessToken, streamId)` | Close the stream on the provider |
| `pollComments(accessToken, sessionId, accountId, cursor)` | Fetch comments since last cursor |

Export the adapter in `packages/platform-adapters/src/index.ts`.

---

### 3. Register in Integrations Service

Register in `services/integrations/src/infrastructure/adapters/adapter-registry.setup.ts`:
```typescript
registry.register(new YourPlatformAdapter(config, logger));
```

---

### 4. Setup Environment Secrets

Add OAuth credentials to `services/integrations/.env.example`:
```env
YOUR_PLATFORM_CLIENT_ID=
YOUR_PLATFORM_CLIENT_SECRET=
YOUR_PLATFORM_REDIRECT_URI=
```

Add Zod validation in `services/integrations/src/main.ts`:
```typescript
const envSchema = baseEnvSchema.extend({
  YOUR_PLATFORM_CLIENT_ID: z.string().min(1),
  YOUR_PLATFORM_CLIENT_SECRET: z.string().min(1),
  YOUR_PLATFORM_REDIRECT_URI: z.string().url(),
});
```

Also add secrets to `services/stream-orchestrator/.env.example` if the orchestrator needs direct platform credentials for broadcasting.

---

### 5. Update OAuth Route Enums

Update route validation schemas in `services/integrations/src/interfaces/http/integrations.routes.ts`:
```typescript
platform: {
  type: 'string',
  enum: ['tiktok', 'facebook', 'your_platform'], // ← Add here
  description: 'Target platform.',
}
```

---

### 6. Synchronize API Gateway Static Spec

Update all `platform` enum arrays in `services/api-gateway/src/main.ts` under `openapi.paths`:
- `SocialAccount.platform` schema
- `LiveSession.destinations[].platform` schema
- `Comment.platform` schema
- OAuth endpoint platform parameter schemas

---

### 7. Add i18n Keys

Add localization strings in `packages/i18n/locales/en.json` and `fr.json`:
```json
{
  "accounts": {
    "platform": {
      "your_platform": "Your Platform Name"
    }
  }
}
```

---

### 8. Add Kubernetes Secret (if needed)

If the stream-orchestrator needs platform credentials in production, add them to:
- `infra/kubernetes/secrets.yaml` (template placeholder only)
- `infra/kubernetes/stream-orchestrator-deployment.yaml` env vars

---

### 9. Verification & Tests

Create platform-specific tests in `services/integrations/tests/platforms/your-platform.adapter.test.ts`:
- Mock provider OAuth endpoints
- Test `exchangeCode`, `refreshTokens`, `getUser`, `createLiveStream`, and `pollComments`
- Test error cases (invalid token, network failure, rate limit)

---

### 10. Documentation Updates

Per `.agents/rules/documentation.md`:

- [ ] `docs/architecture.md` — add row to **Supported Platforms** table
- [ ] `docs/events.md` — add any new platform-specific event payloads
- [ ] `docs/setup.md` — add `YOUR_PLATFORM_CLIENT_ID` to env vars table
- [ ] `services/integrations/.env.example` — add credentials
- [ ] `services/stream-orchestrator/.env.example` — if needed

---

### Verification Checklist

- [ ] `SocialPlatform` enum updated in `shared-types`
- [ ] `IPlatformAdapter` fully implemented
- [ ] Adapter registered in `integrations` service
- [ ] `.env.example` updated with new credentials
- [ ] OAuth route enums updated
- [ ] API Gateway static spec synchronized
- [ ] i18n keys added to `en.json` and `fr.json`
- [ ] Integration tests written
- [ ] Documentation updated
