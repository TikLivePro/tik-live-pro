import type { NextRequest } from 'next/server';

// Allowed CDN protocols for v and a params.
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
// Private/loopback ranges — rejected in production to prevent SSRF via CDN params.
const PRIVATE_IP_RE =
  /^(localhost|127\.|0\.0\.0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fc|fd)/i;

function isValidCdnUrl(raw: string): boolean {
  try {
    const { protocol, hostname } = new URL(raw);
    if (!ALLOWED_PROTOCOLS.has(protocol)) return false;
    if (process.env.NODE_ENV !== 'development' && PRIVATE_IP_RE.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

// Internal Docker hostname for the stream-orchestrator service.
// In local dev without Docker, falls back to the default port.
const BACKEND_BASE =
  process.env['STREAM_ORCHESTRATOR_INTERNAL_URL'] ?? 'http://localhost:3009';

/**
 * GET /api/video-proxy/merge-stream?v=<encoded-video-cdn>&a=<encoded-audio-cdn>
 *
 * Same-origin proxy that forwards a DASH video+audio merge request to the
 * stream-orchestrator's /video-proxy/merge-stream endpoint using the internal
 * Docker hostname. The browser sets this route as video.src so captureStream()
 * works (same-origin) without exposing the internal service URL client-side or
 * depending on NEXT_PUBLIC_API_URL (which is baked at build time and unavailable
 * on the server side for routing to internal services).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const sp = request.nextUrl.searchParams;
  const v = sp.get('v');
  const a = sp.get('a');

  if (!v || !a) {
    return new Response('Missing v or a params', { status: 400 });
  }
  if (!isValidCdnUrl(v) || !isValidCdnUrl(a)) {
    return new Response('Invalid URL in v or a param', { status: 400 });
  }

  // Forward the real client IP so the backend rate-limiter sees individual users,
  // not the shared Next.js container IP.
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';

  const target =
    `${BACKEND_BASE}/video-proxy/merge-stream` +
    `?v=${encodeURIComponent(v)}&a=${encodeURIComponent(a)}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      cache: 'no-store',
      headers: { 'x-forwarded-for': clientIp },
    });
  } catch {
    return new Response('Failed to reach stream-orchestrator', { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(`Backend returned ${upstream.status}`, { status: upstream.status });
  }

  const headers = new Headers({ 'cache-control': 'no-store' });
  const ct = upstream.headers.get('content-type');
  if (ct) headers.set('content-type', ct);

  return new Response(upstream.body, { status: 200, headers });
}
