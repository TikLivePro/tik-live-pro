> **Last updated:** 2026-06-12 (add python3 runtime requirement, --js-runtimes nodejs flag, YouTube datacenter-IP bot detection section and cookie bypass)

# Video Proxy — Platform URL Resolution

This guide explains how TikLivePro resolves streaming-platform links (YouTube, Twitch, Vimeo, Dailymotion) into direct playable URLs so they can be used as a video source during a live session.

---

## Table of Contents

1. [Overview](#overview)
2. [How it works](#how-it-works)
3. [Security model](#security-model)
4. [Supported platforms](#supported-platforms)
5. [Prerequisites — installing yt-dlp](#prerequisites--installing-yt-dlp)
6. [YouTube on datacenter IPs](#youtube-on-datacenter-ips)
7. [Using the UI](#using-the-ui)
8. [API reference](#api-reference)
9. [Environment & configuration](#environment--configuration)
10. [Troubleshooting](#troubleshooting)

---

> **DASH note**: for high-quality YouTube / Vimeo videos, yt-dlp selects separate video-only and audio-only DASH streams. When the resolve response includes both `resolvedUrl` **and** `audioUrl`, the browser cannot play them independently. The `merge-stream` endpoint and the Next.js `video-stream` proxy handle this automatically — see [How it works → DASH path](#dash-path-separate-video--audio).

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

### Browser path (Resolve via server) — combined stream

When yt-dlp returns a single URL that already contains both video and audio (common for Twitch, Dailymotion, and lower-quality YouTube):


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
  args: ['--no-playlist', '--js-runtimes', 'nodejs',
         '--extractor-args', 'youtube:player_client=ios,web',
         '-f', 'best[...]', '--dump-json', '--', url]
  (optional: --cookies /app/youtube-cookies.txt when YTDLP_COOKIES_FILE is set)
        │
        ▼
yt-dlp contacts the platform and extracts the direct CDN URL
(typically an HLS manifest for live streams, a signed mp4 for VOD)
        │
        ▼
Response: { resolvedUrl, title, availableHeights }
        │
        ▼
Browser loads resolvedUrl via Next.js /api/video-stream proxy
(same-origin proxy strips CORS restrictions so captureStream() works)
        │
        ▼
captureStream() captures the video as a MediaStream
        │
        ▼
WebRTC / WHIP → MediaMTX → ffmpeg → TikTok + Facebook
```

### DASH path (separate video + audio)

For high-quality YouTube or Vimeo videos, yt-dlp selects separate DASH streams (video-only H.264 + audio-only AAC). The resolve response includes both `resolvedUrl` and `audioUrl`. The browser cannot play two separate streams; the `merge-stream` endpoint bridges the gap:

```
Response: { resolvedUrl, audioUrl, title, availableHeights }
        │
        ▼
Browser constructs merge URL:
  GET /stream-orchestrator/video-proxy/merge-stream?v=<videoUrl>&a=<audioUrl>
        │
        ▼
stream-orchestrator spawns:
  ffmpeg -i <videoUrl> -i <audioUrl> -c copy -movflags frag_keyframe+empty_moov -f mp4 pipe:1
  (real-time merge, no re-encoding)
        │
        ▼
ffmpeg output piped as fragmented MP4 response
        │
        ▼
Browser loads the merge-stream URL via Next.js /api/video-stream proxy
(same-origin — captureStream() works)
        │
        ▼
captureStream() → WebRTC / WHIP → MediaMTX → ffmpeg → TikTok + Facebook
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

## Prerequisites — installing yt-dlp and ffmpeg

`yt-dlp` **and** `ffmpeg` must both be installed and available in `PATH` on the machine running `stream-orchestrator`.

- `yt-dlp` resolves platform URLs to direct CDN URLs.
- `ffmpeg` merges separate DASH video+audio streams (`merge-stream` endpoint) and is also used by the stream-worker for RTMP broadcast. It is **not** bundled with the application.

> Both are baked into `infra/docker/Dockerfile.stream-orchestrator` — no manual installation needed for Docker/Kubernetes deployments.

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

The runtime image installs:
- `ffmpeg` — DASH stream merge and RTMP broadcast
- `python3` — required interpreter for the yt-dlp Python zipapp
- `yt-dlp` — downloaded at build time from GitHub releases

The version is controlled by a build ARG:

```bash
# Build with the default version (see YTDLP_VERSION ARG in the Dockerfile)
bash infra/docker/build.sh stream-orchestrator

# Build with a specific version
YTDLP_VERSION=2025.07.07 bash infra/docker/build.sh stream-orchestrator
```

To update `yt-dlp`, bump `YTDLP_VERSION` in `infra/docker/Dockerfile.stream-orchestrator` and rebuild the image. This is the recommended approach in production — it keeps updates auditable and reproducible.

**Runtime self-update (enabled by default in production):** `YTDLP_AUTO_UPDATE=true` is set in `docker-compose.prod.managed.yml`, so the container runs `yt-dlp -U` on each startup to pull the latest extractor. This keeps URL resolution working between image rebuilds. Requires outbound internet access; if the update fails the container still starts normally.

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

## YouTube on datacenter IPs

YouTube applies aggressive bot detection to requests originating from datacenter IP ranges (DigitalOcean, AWS, Hetzner, etc.). Even with the latest yt-dlp and the iOS player client (`--extractor-args youtube:player_client=ios,web`), YouTube returns:

```
Sign in to confirm you're not a bot.
```

The only reliable fix for a datacenter server is to authenticate the request using cookies from a logged-in browser session.

### How it works

yt-dlp accepts a Netscape-format cookie file (`--cookies /path/to/cookies.txt`). When cookies from a YouTube-logged-in session are present, YouTube authenticates the server request as a real user and allows extraction.

The `stream-orchestrator` reads the path from `YTDLP_COOKIES_FILE`. If the variable is empty or unset, yt-dlp runs without cookies (works on residential/non-flagged IPs). If set, `--cookies <path>` is added to every yt-dlp invocation automatically.

### Setup (one-time, per server)

**Step 1 — Export cookies from your browser**

Install the [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) Chrome extension (or equivalent for Firefox). Open YouTube while logged into your Google account, click the extension, and export the cookies as `youtube-cookies.txt` (Netscape format).

**Step 2 — Upload to the server**

```bash
scp youtube-cookies.txt root@188.166.197.25:/opt/tiklivepro/youtube-cookies.txt
```

**Step 3 — Activate**

The deploy workflow detects the file automatically on every deploy:
- It appends `YTDLP_COOKIES_FILE=/app/youtube-cookies.txt` to `.env`
- It uncomments the volume mount in `docker-compose.prod.managed.yml`

If you need to activate immediately without waiting for the next tag:

```bash
ssh root@188.166.197.25
cd /opt/tiklivepro
echo "YTDLP_COOKIES_FILE=/app/youtube-cookies.txt" >> .env
sed -i 's|      # - /opt/tiklivepro/youtube-cookies.txt:/app/youtube-cookies.txt:ro|      - /opt/tiklivepro/youtube-cookies.txt:/app/youtube-cookies.txt:ro|' docker-compose.prod.managed.yml
docker compose -f docker-compose.prod.managed.yml up -d stream-orchestrator
```

**Step 4 — Verify**

```bash
docker compose -f /opt/tiklivepro/docker-compose.prod.managed.yml \
  exec stream-orchestrator yt-dlp \
  --no-playlist --js-runtimes nodejs \
  --extractor-args 'youtube:player_client=ios,web' \
  --cookies /app/youtube-cookies.txt \
  --get-url 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
```

A CDN URL in the output confirms authentication is working.

### Cookie expiry

YouTube cookies expire — typically after a few weeks to a few months depending on account activity. The symptom is `RESOLVE_FAILED` returning after a period of successful operation. When this happens, re-export and re-upload:

```bash
# Re-export from browser → download youtube-cookies.txt
scp youtube-cookies.txt root@188.166.197.25:/opt/tiklivepro/youtube-cookies.txt
docker compose -f /opt/tiklivepro/docker-compose.prod.managed.yml \
  restart stream-orchestrator
```

No redeployment or image rebuild is needed — the file is bind-mounted at runtime.

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

### `GET /stream-orchestrator/video-proxy/merge-stream`

Merges a DASH video-only CDN URL and an audio-only CDN URL in real time using ffmpeg and streams the result as fragmented MP4. This is consumed by the browser through the Next.js `/api/video-stream` proxy.

**Authentication:** none — the CDN URLs are already time-limited tokens issued by the authenticated `/resolve` endpoint.  
**Rate limit:** 3 concurrent streams per IP.

**Query parameters:**

| Param | Description |
|---|---|
| `v` | URL-encoded video-only CDN URL |
| `a` | URL-encoded audio-only CDN URL |

**Success:** HTTP 200, `Content-Type: video/mp4` — streaming fragmented MP4. The connection stays open for the duration of playback; closing it kills the ffmpeg process.

**Error codes:**

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `MISSING_PARAMS` | `v` or `a` query param is missing |
| 400 | `INVALID_URL` | One of the URLs is malformed or non-http/https |
| 400 | `PRIVATE_URL` | One of the URLs resolves to a private/loopback IP (SSRF guard) |
| 429 | `RATE_LIMITED` | 3 concurrent stream limit per IP reached |

> **Important:** always load the merge-stream URL via the Next.js `/api/video-stream` proxy (same origin) rather than fetching it directly from the browser. Direct cross-origin fetches will fail `captureStream()` with a `SecurityError` because CDN responses lack the required CORS headers.

---

### `GET /api/video-stream` (Next.js proxy)

A same-origin HTTP proxy built into the Next.js web app. It fetches any `http`/`https` URL on the server side and forwards the response (including `Content-Type`, `Content-Length`, byte-range support) to the browser.

**Purpose:** CDN video URLs returned by yt-dlp lack the `crossorigin` CORS headers that `captureStream()` requires. Loading them through this same-origin proxy makes the `<video>` element treated as same-origin, so `captureStream()` works without a CORS error.

**Usage:**

```
/api/video-stream?url=<encoded-url>
```

**Supports:** `Range` request header is forwarded upstream, enabling seek/resume in the `<video>` element.

**SSRF guard:** private/loopback IP ranges (`127.x`, `10.x`, `192.168.x`, etc.) are blocked in production. `localhost` is only allowed in `NODE_ENV=development`.

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

| Variable | Default (prod) | Description |
|---|---|---|
| `YTDLP_AUTO_UPDATE` | `true` | Runs `yt-dlp -U` on each container startup. Keeps extractors current between image rebuilds. Requires outbound internet. |
| `YTDLP_COOKIES_FILE` | _(empty)_ | Absolute path inside the container to a Netscape-format YouTube cookies file. Set to `/app/youtube-cookies.txt` and bind-mount the file to bypass datacenter-IP bot detection. Auto-activated by the deploy workflow if `/opt/tiklivepro/youtube-cookies.txt` exists on the server. |

The `yt-dlp` binary version is set at image build time via the `YTDLP_VERSION` build ARG in `infra/docker/Dockerfile.stream-orchestrator`. It is not an env var — change it and rebuild to update.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| HTTP 503 `YTDLP_NOT_INSTALLED` | `yt-dlp` not in `PATH` | Install yt-dlp and ensure it is accessible to the Node.js process |
| HTTP 504 `RESOLVE_TIMEOUT` | Platform rate-limiting yt-dlp, or slow network | Wait a minute and retry; update yt-dlp (`yt-dlp -U`) |
| HTTP 422 `RESOLVE_FAILED` | yt-dlp binary is outdated | Run `yt-dlp -U` or bump `YTDLP_VERSION` and rebuild |
| HTTP 422 `RESOLVE_FAILED` (after working) | YouTube cookies expired | Re-export and re-upload cookies — see [YouTube on datacenter IPs](#youtube-on-datacenter-ips) |
| HTTP 422 `VIDEO_UNAVAILABLE` | Video is private, deleted, or geo-blocked | Verify the URL is publicly accessible from the server's location |
| `Sign in to confirm you're not a bot` in logs | Datacenter IP blocked by YouTube bot detection | Upload a YouTube cookies file — see [YouTube on datacenter IPs](#youtube-on-datacenter-ips) |
| `env: can't execute 'python3'` in logs (exit code 127) | `python3` not installed in the container image | Rebuild from the latest `Dockerfile.stream-orchestrator` (python3 added to runtime apk) |
| `No supported JavaScript runtime` warning in logs | yt-dlp cannot find deno/node | `--js-runtimes nodejs` is passed by default; verify Node.js is in `PATH` inside the container |
| Video loads in preview but is black/silent | Resolved URL expired (VOD CDN links are time-limited) | Paste the original platform URL and resolve again |
| `captureStream()` fails with SecurityError | Resolved URL loaded directly (not via `/api/video-stream` proxy) | The browser must load the URL through `/api/video-stream?url=…`; this is handled automatically by `VideoSourcePicker` |
| Black video + no audio after resolution (YouTube HD) | DASH streams: `audioUrl` present but not merged | The merge-stream endpoint requires ffmpeg — verify `ffmpeg -version` on the server |
| HTTP 429 on merge-stream | More than 3 concurrent DASH streams from the same IP | Close other live sessions or wait for the current stream to end |
| HTTP 429 after a few clicks | Rate limit hit | Wait 60 s before resolving again |
| Resolution works in dev but not in production | Stale yt-dlp image or missing python3 | Rebuild after bumping `YTDLP_VERSION`; ensure `python3` is in the runtime apk install |

---

## Related documents

- [`docs/architecture.md`](./architecture.md) — system overview and service catalogue
- [`docs/setup.md`](./setup.md) — prerequisites, environment variables, and local setup
- [`docs/decisions/003-video-proxy-yt-dlp.md`](./decisions/003-video-proxy-yt-dlp.md) — architectural decision record
