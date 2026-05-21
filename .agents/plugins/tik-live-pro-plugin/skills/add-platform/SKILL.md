# Skill: Add a New Streaming Platform

This skill details how to integrate a new social streaming platform (e.g. YouTube, Twitch, Instagram) into the TikLivePro monorepo.

---

## Preconditions / Trigger Criteria
Use this skill when:
- The user requests to add support for a new social network.
- Building platform-specific authentication, RTMP endpoints, or chat sync.

---

## Detailed Implementation Steps

### 1. Register Platform Type
Add the new platform value in `packages/shared-types/src/social.types.ts`:
```typescript
export const SocialPlatform = {
  TIKTOK: 'tiktok',
  FACEBOOK: 'facebook',
  YOUR_PLATFORM: 'your_platform', // ← Register key here
} as const;
```

### 2. Implement Platform Adapter
Create a new platform-specific adapter under `packages/platform-adapters/src/platforms/<platform>/<Platform>Adapter.ts` implementing `IPlatformAdapter`:
- `exchangeCode(code, redirectUri)`: Handles OAuth token exchange.
- `refreshTokens(refreshToken)`: Requests a fresh access token.
- `revokeTokens(accessToken)`: Revokes current platform access.
- `getUser(accessToken)`: Fetches user metadata and profile details.
- `createLiveStream(accessToken, title, description)`: Scaffolds the live RTMP endpoint and returns ingest URL + stream key.
- `endLiveStream(accessToken, streamId)`: Closes the stream on the third-party provider.
- `pollComments(accessToken, sessionId, accountId, cursor)`: Fetches live comments since the last cursor check.

Export your new adapter in `packages/platform-adapters/src/index.ts`.

### 3. Register in Integrations Service
Register your adapter inside `services/integrations/src/infrastructure/adapters/adapter-registry.setup.ts`:
```typescript
registry.register(new YourPlatformAdapter(config, logger));
```

### 4. Setup Environment Secrets
Add OAuth credentials to `services/integrations/.env.example`:
```
YOUR_PLATFORM_CLIENT_ID=
YOUR_PLATFORM_CLIENT_SECRET=
YOUR_PLATFORM_REDIRECT_URI=
```
Add Zod validation in `services/integrations/src/main.ts`:
```typescript
const envSchema = baseEnvSchema.extend({
  YOUR_PLATFORM_CLIENT_ID: z.string(),
  YOUR_PLATFORM_CLIENT_SECRET: z.string(),
});
```

### 5. Update OAuth Route Enums
Update route validation schemas inside `services/integrations/src/interfaces/http/integrations.routes.ts`:
```typescript
platform: {
  type: 'string',
  enum: ['tiktok', 'facebook', 'your_platform'], // ← Add here
  description: 'Target platform.',
}
```

### 6. Synchronize API Gateway static spec
Update all `platform` enum arrays in `services/api-gateway/src/main.ts` under:
- `SocialAccount.platform` schema
- `LiveSession.destinations[].platform` schema
- `Comment.platform` schema
- OAuth endpoints schemas.

### 7. Add i18n Keys
Add localization strings in `packages/i18n/locales/en.json` and `fr.json` under `accounts.platform`:
```json
"your_platform": "Your Platform Name"
```

### 8. Verification & Tests
Create platform-specific tests in `services/integrations/tests/platforms/your-platform.adapter.test.ts` to mock provider endpoints and test `exchangeCode`, `getUser`, `createLiveStream`, and `pollComments`.
