# Skill: Review a Pull Request

This skill runs a structured, high-quality assessment of any incoming monorepo code modifications.

---

## Preconditions / Trigger Criteria
Use this skill when:
- The user requests to review or audit a pull request or code changes.
- Preparing a list of architectural corrections before staging changes.

---

## Core Review Checklist

### 1. Architectural Boundaries
- Enforce the inward dependency rule: `infrastructure` → `application` → `domain` (Domain is framework-independent).
- Verify no platform-specific details are leaked inside core services (`live-session`, `comments`, `stream-orchestrator`). Leakage must be moved to `platform-adapters`.
- Prevent cross-service database transactions. Services must only query their own local schema.
- Validate that Application Use Cases adhere to Single Responsibility.

### 2. Event-Driven Validation
- Confirm new events are registered with versioned Zod schemas under `packages/events/src/schemas/`.
- Ensure all events carry standard properties: `eventId`, `version`, `occurredAt`, `correlationId`, and `traceId`.
- Verify event consumers are idempotent and safe from duplicate processing.
- Verify Dead-Letter Queue mappings.

### 3. API & Swagger Verification
- Check that every Fastify controller registers a comprehensive `schema` block.
- Verify private routes define `security: [{ BearerAuth: [] }]`, and public endpoints explicitly exclude the security block.
- Confirm all response codes are schema-validated.
- Validate that parameter and payload fields are annotated with `description` and `example` attributes.
- Ensure API Gateway static OpenAPI specs under `services/api-gateway/src/main.ts` match.
- Add public prefix paths to `PUBLIC_PREFIXES` in the gateway schema.

### 4. Code Quality & Security
- Reject any usage of the `any` keyword. Narrow types with guards or Zod bounds.
- Require explicit return signatures on all exported assets.
- Ensure environment variables are Zod-validated during service startup.
- Validate user inputs prior to forwarding payloads into application ports.
- Ensure all social OAuth tokens are encrypted at-rest using AES-256-GCM.
- Verify rate-limiting is registered on all incoming gateway controllers.

### 5. Localization & Tests
- Ensure no hardcoded user-facing strings are introduced in frontend layers (always use translation keys).
- Confirm translation additions are made symmetrically to both `en.json` and `fr.json`.
- Enforce unit tests for all updated Domain Use Cases.
