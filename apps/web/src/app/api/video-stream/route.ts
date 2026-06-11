import type { NextRequest } from 'next/server';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// Crude SSRF guard: reject loopback and RFC-1918 / link-local addresses.
const PRIVATE_IP_RE =
  /^(localhost|127\.|0\.0\.0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fc|fd)/i;

export async function GET(request: NextRequest): Promise<Response> {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return new Response('Missing url', { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response('Invalid url', { status: 400 });
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return new Response('Only http/https URLs are allowed', { status: 400 });
  }
  if (process.env.NODE_ENV !== 'development' && PRIVATE_IP_RE.test(parsed.hostname)) {
    return new Response('Private/loopback URLs are not allowed', { status: 400 });
  }

  const upstreamHeaders: Record<string, string> = {
    'user-agent': 'Mozilla/5.0',
  };
  const range = request.headers.get('range');
  if (range) upstreamHeaders['range'] = range;

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: upstreamHeaders });
  } catch {
    return new Response('Failed to fetch upstream URL', { status: 502 });
  }

  const responseHeaders = new Headers();
  for (const key of ['content-type', 'content-length', 'content-range']) {
    const val = upstream.headers.get(key);
    if (val) responseHeaders.set(key, val);
  }
  responseHeaders.set('accept-ranges', 'bytes');
  responseHeaders.set('cache-control', 'no-store');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
