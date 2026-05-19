# ADR-002: Comment Ingestion via Polling

**Date**: 2026-05-19  
**Status**: Accepted

## Context

TikTok and Facebook do not provide a WebSocket or push callback for live comments — they expose polling APIs. We need to decide how to ingest comments in near-real-time.

## Decision

Use **server-side polling** in the Comments Service, not client-side polling.

The `CommentPoller` class polls each platform adapter on a configurable interval (default 2–5 seconds per destination) and publishes results to NATS `comment.received`. The UI receives comments via a WebSocket connection to the Comments Service.

## Rationale

- Centralizes API call logic — no platform credentials on the client
- Platform rate limits are managed server-side, shared across all users
- WebSocket push to the client is lower latency than client HTTP polling
- Polling interval can be tuned per platform without a client release

## Consequences

- Comments may be up to `pollInterval` seconds delayed
- Platform API rate limits constrain minimum interval
- Requires the Comments Service to maintain per-session polling state in memory
- If the Comments Service restarts, in-progress polling must resume (tracked via cursor persisted to DB)

## Future consideration

If TikTok or Facebook add WebSocket/webhook push, implement a new adapter method `subscribeToComments()` to replace polling without changing the downstream contract.
