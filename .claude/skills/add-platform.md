# Skill: Add a New Streaming Platform

Use this skill when the user wants to add a new social platform (e.g., YouTube, Instagram, Twitch) to TikLivePro.

## Checklist

### 1. Add platform to shared types
File: `packages/shared-types/src/social.types.ts`
```typescript
export const SocialPlatform = {
  TIKTOK: 'tiktok',
  FACEBOOK: 'facebook',
  YOUR_PLATFORM: 'your_platform', // ← add here
} as const;
```

### 2. Create the platform adapter
Create: `packages/platform-adapters/src/platforms/<platform>/<Platform>Adapter.ts`
Implement: `IPlatformAdapter` interface from `packages/platform-adapters/src/interface/platform-adapter.interface.ts`

Required methods:
- `exchangeCode(code, redirectUri)` — OAuth flow
- `refreshTokens(refreshToken)` — token refresh
- `revokeTokens(accessToken)` — disconnect
- `getUser(accessToken)` — fetch platform profile
- `createLiveStream(accessToken, title, description)` — create RTMP endpoint
- `endLiveStream(accessToken, streamId)` — close stream
- `pollComments(accessToken, sessionId, accountId, cursor)` — fetch comments

### 3. Export the adapter
File: `packages/platform-adapters/src/index.ts`
Add export for the new adapter class and config type.

### 4. Register in the integrations service
File: `services/integrations/src/infrastructure/adapters/adapter-registry.setup.ts`
```typescript
registry.register(new YourPlatformAdapter(config, logger));
```

### 5. Add OAuth credentials
File: `services/integrations/.env.example`
Add:
```
YOUR_PLATFORM_CLIENT_ID=
YOUR_PLATFORM_CLIENT_SECRET=
YOUR_PLATFORM_REDIRECT_URI=
```

Also add corresponding Zod validation in `services/integrations/src/main.ts`:
```typescript
const envSchema = baseEnvSchema.extend({
  YOUR_PLATFORM_CLIENT_ID: z.string(),
  YOUR_PLATFORM_CLIENT_SECRET: z.string(),
});
```

### 6. Add OAuth routes to the integrations service
File: `services/integrations/src/interfaces/http/integrations.routes.ts`

The OAuth start and callback routes are handled generically via `/:platform` params, so no new route handlers are needed — **but** update the `enum` in the existing route schemas to include the new platform value:

```typescript
// In the params schema of both /oauth/:platform/start and /oauth/:platform/callback:
platform: {
  type: 'string',
  enum: ['tiktok', 'facebook', 'your_platform'],  // ← add here
  description: 'Target platform.',
},
```

### 7. Update the API Gateway static spec
File: `services/api-gateway/src/main.ts`

Update the `enum` arrays in the gateway's static OpenAPI spec wherever platform values appear:
- `SocialAccount.platform` schema (under `components.schemas`)
- `LiveSession.destinations[].platform` schema
- `Comment.platform` schema
- `/integrations/oauth/{platform}/start` and `/callback` parameter schemas
- Any analytics platform breakdown schemas

### 8. Add i18n keys
Files: `packages/i18n/locales/en.json` and `fr.json`
Add under `accounts.platform`:
```json
"your_platform": "Your Platform"
```

### 9. Add integration tests
File: `services/integrations/tests/platforms/your-platform.adapter.test.ts`
Test: `exchangeCode`, `getUser`, `createLiveStream`, `pollComments` with mocked HTTP responses.

### 10. Update docs
File: `docs/architecture.md` — add platform to supported platforms list.

## Constraints
- Never add platform-specific logic to `live-session`, `comments`, or `stream-orchestrator` services
- All platform HTTP calls must go through the adapter
- OAuth tokens must be encrypted before storage (handled by integrations service infrastructure layer)
- Swagger `enum` values for `platform` must be updated in **both** the integrations service routes and the API Gateway static spec
