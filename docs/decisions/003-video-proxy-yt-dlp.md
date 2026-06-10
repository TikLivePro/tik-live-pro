# ADR-003: yt-dlp for streaming-platform URL resolution

**Date:** 2026-06-09
**Status:** Accepted

---

## Context

TikLivePro lets streamers share a video source (local file, webcam, or online URL) during a live session. The online URL path feeds a URL into a browser `<video>` element, captures the stream with `captureStream()`, and sends it to viewers via WebRTC/WHIP.

Users repeatedly requested support for YouTube, Twitch, and Vimeo links. Direct platform URLs cannot be loaded in `<video>` because:

1. Platforms do not expose plain media URLs — content is served through proprietary players.
2. CDN URLs (when they can be found) carry CORS restrictions that prevent `captureStream()` from working.
3. Pasting such URLs causes a silent load failure with no useful error message.

Several approaches were evaluated:

| Option | Pros | Cons |
|---|---|---|
| **Reject with a clear error** | Zero complexity | Users are stuck |
| **iframe embed** | No backend needed | Cannot `captureStream()` from a sandboxed iframe — useless for streaming |
| **Client-side yt-dlp (WASM)** | No server dependency | Not available; yt-dlp has no WASM build |
| **Third-party extraction API** | No server maintenance | Introduces external dependency, potential privacy/legal exposure |
| **yt-dlp subprocess on stream-orchestrator** | Full control, no third party, works for all supported platforms | Requires yt-dlp installed on the server; CDN URLs are time-limited |

---

## Decision

Use `yt-dlp` as a subprocess on `stream-orchestrator` to extract direct media URLs from platform links.

Two integration points:

1. **`POST /video-proxy/resolve`** — a dedicated endpoint the frontend calls when the user clicks "Resolve via server". Returns the extracted URL and title. The browser then loads the URL in `<video>`.

2. **`POST /sessions/:id/video-push`** — extended to detect platform URLs and resolve them internally before starting the ffmpeg loop. This covers server-side-only clients (mobile, CLI) that do not use the browser WHIP path.

`yt-dlp` is spawned with `child_process.spawn(..., { shell: false })` using an argument array. The platform URL is always the last argument, preceded by `--` to prevent it from being interpreted as a flag. A 30-second `SIGKILL` timeout prevents process accumulation.

An explicit hostname allowlist (`isPlatformUrl`) gates every yt-dlp invocation, preventing SSRF. The allowlist covers only the four supported platforms; Facebook, Instagram, and TikTok are excluded because their content requires authenticated session cookies that cannot be provided server-side.

---

## Consequences

### Positive

- Users can now use YouTube, Twitch, Vimeo, and Dailymotion links directly in the video source picker.
- `video-push` transparently handles platform URLs — no change required by mobile or automation clients.
- No third-party service dependency; extraction logic runs on the same server as ffmpeg.
- Security is enforced at the subprocess level (no shell, allowlist, timeout, no stdin).

### Negative / risks

- **yt-dlp must be installed on every deployment** of `stream-orchestrator`. This adds an OS-level dependency that must be maintained separately from the Node.js package graph.
- **CDN URLs are time-limited.** YouTube VOD URLs typically expire in ~6 hours. Long sessions must re-resolve. Live stream HLS manifests are unaffected (they stay valid until the broadcast ends).
- **yt-dlp can break.** Platforms update their internal streaming protocols without notice. A stale yt-dlp binary will cause `RESOLVE_FAILED` errors for all users. Regular updates (`yt-dlp -U`) are required.
- **DRM-protected content cannot be extracted.** Widevine/FairPlay-protected videos will fail with `RESOLVE_FAILED`. This is by design — circumventing DRM is outside the scope of this feature.
- **In-memory rate limiter** (5 req/IP/min) is per-process and does not persist across restarts or scale across multiple replicas. For multi-instance deployments, replace with a Redis-backed rate limiter if abuse becomes a concern.
