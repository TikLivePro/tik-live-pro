> **Last updated:** 2026-06-10 (add yt-dlp to Dockerfile, YTDLP_VERSION build ARG, YTDLP_AUTO_UPDATE env var)

# Video Proxy — Platform URL Resolution

This guide explains how TikLivePro resolves streaming-platform links (YouTube, Twitch, Vimeo, Dailymotion) into direct playable URLs so they can be used as a video source during a live session.

---

## Table of Contents

1. [Overview](#overview)
2. [How it works](#how-it-works)
3. [Security model](#security-model)
4. [Supported platforms](#supported-platforms)
5. [Prerequisites — installing yt-dlp](#prerequisites--installing-yt-dlp)
6. [Using the UI](#using-the-ui)
7. [API reference](#api-reference)
8. [Environment & configuration](#environment--configuration)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The browser's `<video>` element can only load **direct media URLs** — a raw `.mp4`, `.webm`, or an HLS manifest (`.m3u8`). Pasting a YouTube or Twitch link into the URL field fails because those platforms serve content through proprietary players, not plain URLs, and they apply CORS restrictions that prevent the stream from being captured.

The Video Proxy solves this with two complementary mechanisms:

| Mechanism | Where it runs | What it does |
|---|---|---|
| **Resolve via server** (frontend button) | `stream-orchestrator` backend | Extracts a direct CDN URL using `yt-dlp`, returns it to the browser, which loads it in `<video>` and streams it via WHIP |
| **video-push with platform URL** (API / mobile) | `stream-orchestrator` backend | Detects platform URLs in `POST /sessions/:id/video-push`, resolves with `yt-dlp`, then passes the result directly to `ffmpeg` — no browser involvement |

---

## How it works

### Browser path (Resolve via server)

```
User pastes YouTube URL
        │
        ▼
VideoSourcePicker detects platform URL
→ shows amber warning + "Resolve via server" button
        │
        ▼
User clicks "Resolve via server"
        │
        ▼
POST /stream-orchestrator/video-proxy/resolve
  { url: "https://www.youtube.com/watch?v=..." }
        │
        ▼
stream-orchestrator: isPlatformUrl() check (allowlist gate)
        │
        ▼
resolveWithYtDlp() spawns yt-dlp as a sandboxed subprocess
  args: ['--no-playlist', '-f', 'best[...]', '--get-title', '--get-url', '--', url]
        │
        ▼
yt-dlp contacts the platform and extracts the direct CDN URL
(typically an HLS manifest for live streams, a signed mp4 for VOD)
        │
        ▼
Response: { resolvedUrl, title }
        │
        ▼
Browser loads resolvedUrl in <video crossorigin="anonymous">
        │
        ▼
captureStream() captures the video as a MediaStream
        │
        ▼
WebRTC / WHIP → MediaMTX → ffmpeg → TikTok + Facebook
```

### Server-push path (video-push with platform URL)

```
POST /stream-orchestrator/sessions/:id/video-push
  { videoUri: "https://www.youtube.com/watch?v=..." }
        │
        ▼
isPlatformUrl() check (allowlist gate)
        │
        ▼
resolveWithYtDlp() extracts the direct CDN URL
        │
        ▼
ffmpeg -i <resolvedUrl> ... → RTMP → TikTok + Facebook
```

This path bypasses the browser entirely — useful for mobile clients or automated workflows where the session is already live.

---

## Security model

### SSRF prevention

`yt-dlp` is only ever invoked for URLs that match an explicit hostname allowlist in `ytdlp-resolver.ts`. Any URL not on the list is rejected with HTTP 400 **before** the subprocess is spawned:

```
youtube.com, www.youtube.com, youtu.be, m.youtube.com
twitch.tv, www.twitch.tv, clips.twitch.tv
vimeo.com, www.vimeo.com, player.vimeo.com
dailymotion.com, www.dailymotion.com
```

Private IP ranges and internal addresses are also blocked by the client-side `isUnsafeVideoUrl()` validator in `VideoSourcePicker` (a first line of defence — backend enforcement is the authoritative gate).

### Subprocess sandboxing

`yt-dlp` is spawned with `spawn('yt-dlp', args, { shell: false })`. The argument array is never concatenated into a shell string, eliminating command injection. `stdin` is closed (`'ignore'`); only `stdout` and `stderr` pipes are opened.

### Authentication

The `/video-proxy/resolve` endpoint requires a valid Bearer JWT. The API Gateway validates the token before the request reaches `stream-orchestrator`.

### Rate limiting

`/video-proxy/resolve` is rate-limited to **5 requests per IP per 60 seconds** (in-memory, per-process). This prevents a single user from exhausting server CPU with rapid yt-dlp spawns.

### Timeout

Each `yt-dlp` process is killed with `SIGKILL` after **30 seconds** if it has not exited, preventing runaway processes from accumulating.

---

## Supported platforms

| Platform | Live streams | VOD | Notes |
|---|---|---|---|
| **YouTube** | ✅ | ✅ | Live streams resolve to an HLS manifest; VOD to a signed mp4 URL (expires ~6 h) |
| **Twitch** | ✅ | ✅ (VODs) | Live streams resolve to an HLS manifest |
| **Vimeo** | ⚠️ | ✅ | Private/password-protected videos will fail with `VIDEO_UNAVAILABLE` |
| **Dailymotion** | ✅ | ✅ | |
| Facebook | ❌ | ❌ | Excluded — requires authenticated cookies that yt-dlp cannot obtain server-side |
| Instagram | ❌ | ❌ | Excluded — same reason |
| TikTok | ❌ | ❌ | Excluded — same reason |

> **DRM content**: videos protected by Widevine or FairPlay DRM cannot be extracted by yt-dlp regardless of platform. Attempting to resolve them returns a `RESOLVE_FAILED` error.

---

## Prerequisites — installing yt-dlp

`yt-dlp` must be installed and available in `PATH` on the machine running `stream-orchestrator`. It is **not** bundled with the application.

### Linux (recommended for production)

```bash
# Via pip (always up-to-date)
pip install yt-dlp

# Or download the standalone binary
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp
```

### macOS (development)

```bash
brew install yt-dlp
```

### Windows (development)

```powershell
winget install yt-dlp
# or
scoop install yt-dlp
```

### Docker

`yt-dlp` is baked into `infra/docker/Dockerfile.stream-orchestrator` — no manual installation is needed for Docker/Kubernetes deployments.

The version is controlled by a build ARG:

```bash
# Build with the default version (see YTDLP_VERSION ARG in the Dockerfile)
bash infra/docker/build.sh stream-orchestrator

# Build with a specific version
YTDLP_VERSION=2025.03.27 bash infra/docker/build.sh stream-orchestrator
```

To update `yt-dlp`, bump `YTDLP_VERSION` in `infra/docker/Dockerfile.stream-orchestrator` and rebuild the image. This is the recommended approach in production — it keeps updates auditable and reproducible.

**Runtime self-update (optional):** set `YTDLP_AUTO_UPDATE=true` in the container environment to run `yt-dlp -U` on each container startup. This is useful for emergency patching without a full image rebuild, but requires outbound internet access from the container. If the update fails the container still starts normally.

### Verify installation

```bash
yt-dlp --version
# Expected: 2024.XX.XX or later
```

If `yt-dlp` is not found when a resolve request arrives, the endpoint returns HTTP **503 YTDLP_NOT_INSTALLED**.

### Keeping yt-dlp up-to-date

Platforms update their internal protocols frequently. A stale `yt-dlp` binary is the most common cause of `RESOLVE_FAILED` errors.

| Deployment | Recommended approach |
|---|---|
| Docker / Kubernetes | Bump `YTDLP_VERSION` in `Dockerfile.stream-orchestrator`, rebuild and redeploy |
| Local dev (host) | `yt-dlp -U` or `pip install --upgrade yt-dlp` |
| Emergency (no rebuild) | Set `YTDLP_AUTO_UPDATE=true` and restart the container |

---

## Using the UI

### Step-by-step

1. In the live session setup screen, click the **URL** tab in the video source picker.
2. Paste a supported platform URL (e.g. a YouTube video or Twitch channel URL).
3. An **amber warning** appears:
   > *"Streaming platforms (YouTube, Twitch…) can't be captured — use a direct .mp4 or .m3u8 URL, or resolve it via the server."*
4. Click **Resolve via server**.
5. A spinner appears while `yt-dlp` runs (up to 30 seconds).
6. On success, the video loads automatically in the preview player and is ready to stream.
7. On failure, a red error message appears below the button with the reason.

### What happens after resolution

The resolved URL is a time-limited CDN link. If the session runs for a long time (several hours), the URL may expire and the video will stop loading. In that case, paste the original platform URL again and click **Resolve via server** to refresh it.

For **live streams** (e.g. a Twitch live channel), the resolved HLS manifest URL stays valid for the duration of the broadcast.

---

## API reference

### `POST /stream-orchestrator/video-proxy/resolve`

Resolves a platform URL to a direct media URL.

**Authentication:** Bearer JWT required.
**Rate limit:** 5 requests per IP per 60 seconds.

**Request body:**
```json
{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
```

**Success response (200):**
```json
{
  "resolvedUrl": "https://rr3---sn-xxx.googlevideo.com/videoplayback?...",
  "title": "Rick Astley - Never Gonna Give You Up"
}
```

**Error codes:**

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `UNSUPPORTED_PLATFORM` | URL is not from an allowed platform |
| 401 | — | Missing or invalid JWT |
| 422 | `VIDEO_UNAVAILABLE` | Video is private, deleted, or geo-blocked |
| 422 | `RESOLVE_FAILED` | yt-dlp could not extract a playable URL |
| 429 | `RATE_LIMITED` | Rate limit exceeded — try again in 60 s |
| 503 | `YTDLP_NOT_INSTALLED` | yt-dlp is not installed on the server |
| 504 | `RESOLVE_TIMEOUT` | yt-dlp did not respond within 30 s |

---

### `POST /stream-orchestrator/sessions/:sessionId/video-push`

Existing endpoint, now extended to accept platform URLs. When a platform URL is detected, the backend resolves it with yt-dlp before starting the ffmpeg loop. The response and behaviour are identical to a direct URL.

**Example with a YouTube URL:**
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"videoUri":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
  http://localhost:3000/stream-orchestrator/sessions/<sessionId>/video-push
```

Additional error codes (on top of the existing ones):

| HTTP | Code | Meaning |
|---|---|---|
| 422 | `VIDEO_UNAVAILABLE` | Video is private, deleted, or geo-blocked |
| 422 | `RESOLVE_FAILED` | Could not extract a playable URL |
| 503 | `YTDLP_NOT_INSTALLED` | yt-dlp is not installed |
| 504 | `RESOLVE_TIMEOUT` | yt-dlp timed out |

---

## Environment & configuration

| Variable | Default | Description |
|---|---|---|
| `YTDLP_AUTO_UPDATE` | `false` | Set to `true` to run `yt-dlp -U` on each container startup. Requires outbound internet access. |

The `yt-dlp` binary version is set at image build time via the `YTDLP_VERSION` build ARG in `infra/docker/Dockerfile.stream-orchestrator`. It is not an env var — change it and rebuild to update.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| HTTP 503 `YTDLP_NOT_INSTALLED` | `yt-dlp` not in `PATH` | Install yt-dlp and ensure it is accessible to the Node.js process |
| HTTP 504 `RESOLVE_TIMEOUT` | Platform rate-limiting yt-dlp, or slow network | Wait a minute and retry; update yt-dlp (`yt-dlp -U`) |
| HTTP 422 `RESOLVE_FAILED` | yt-dlp binary is outdated | Run `yt-dlp -U` to update to the latest version |
| HTTP 422 `VIDEO_UNAVAILABLE` | Video is private, deleted, or geo-blocked | Verify the URL is publicly accessible from the server's location |
| Video loads in preview but is black/silent | Resolved URL expired (VOD CDN links are time-limited) | Paste the original platform URL and resolve again |
| `captureStream()` fails with SecurityError | Resolved URL has restrictive CORS headers | Use `video-push` (server-side path) instead of the browser WHIP path |
| HTTP 429 after a few clicks | Rate limit hit | Wait 60 s before resolving again |
| Resolution works in dev but not in production | `yt-dlp` binary missing or stale in the image | Rebuild the image after bumping `YTDLP_VERSION` in `Dockerfile.stream-orchestrator` |

---

## Related documents

- [`docs/architecture.md`](./architecture.md) — system overview and service catalogue
- [`docs/setup.md`](./setup.md) — prerequisites, environment variables, and local setup
- [`docs/decisions/003-video-proxy-yt-dlp.md`](./decisions/003-video-proxy-yt-dlp.md) — architectural decision record
