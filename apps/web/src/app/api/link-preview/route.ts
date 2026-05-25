import { type NextRequest, NextResponse } from 'next/server';
import type { LinkPreviewData } from '@/features/comments/interfaces/link-preview.interfaces';

function isAllowedUrl(parsed: URL): boolean {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname;
  if (process.env.NODE_ENV !== 'development') {
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(host)) return false;
  }
  return true;
}

function extractMeta(html: string): Omit<LinkPreviewData, 'url' | 'domain'> {
  const getMeta = (...names: string[]): string | null => {
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re1 = new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"'<>]+)["']`,
        'i',
      );
      const re2 = new RegExp(
        `<meta[^>]+content=["']([^"'<>]+)["'][^>]+(?:property|name)=["']${escaped}["']`,
        'i',
      );
      const m = html.match(re1) ?? html.match(re2);
      if (m?.[1]) return m[1].trim();
    }
    return null;
  };

  const rawTitle =
    getMeta('og:title', 'twitter:title') ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
    null;

  return {
    title: rawTitle?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() ?? null,
    description: getMeta('og:description', 'twitter:description', 'description') ?? null,
    image: getMeta('og:image', 'twitter:image', 'twitter:image:src') ?? null,
    siteName: getMeta('og:site_name') ?? null,
  };
}

/** Direct HTML fetch — works for most sites, fails on Cloudflare-protected ones. */
async function fetchDirect(rawUrl: string, parsed: URL): Promise<LinkPreviewData | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(rawUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });
    clearTimeout(timer);

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null;
    }
    if (res.status >= 500) return null;

    // Read at most 100 KB — enough to capture all <head> meta tags
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    const MAX = 100 * 1024;
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.byteLength;
      if (total >= MAX) { await reader.cancel(); break; }
    }

    const html = new TextDecoder().decode(Buffer.concat(chunks));

    // Detect Cloudflare / bot-protection challenge pages — bail early so the
    // fallback kicks in instead of returning empty metadata.
    if (
      html.includes('challenges.cloudflare.com') ||
      html.includes('cf-browser-verification') ||
      html.includes('__cf_chl') ||
      (res.status === 403 && html.includes('Just a moment'))
    ) {
      return null;
    }

    const meta = extractMeta(html);
    // Only return if we got at least a title — otherwise fallback may do better
    if (!meta.title) return null;

    return { url: rawUrl, domain: parsed.hostname, ...meta };
  } catch (err) {
    clearTimeout(timer);
    console.warn('[link-preview] direct fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Microlink fallback — uses a headless browser service that can render
 * Cloudflare-protected pages. Free tier: ~50 req/day per IP.
 */
async function fetchMicrolink(rawUrl: string, parsed: URL): Promise<LinkPreviewData | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(rawUrl)}&palette=false&audio=false&video=false&iframe=false`;
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return null;

    const body = (await res.json()) as {
      status: string;
      data?: {
        title?: string | null;
        description?: string | null;
        image?: { url?: string | null } | null;
        publisher?: string | null;
      };
    };

    if (body.status !== 'success' || !body.data) return null;

    const { title, description, image, publisher } = body.data;
    return {
      url: rawUrl,
      domain: parsed.hostname,
      title: title ?? null,
      description: description ?? null,
      image: image?.url ?? null,
      siteName: publisher ?? null,
    };
  } catch (err) {
    clearTimeout(timer);
    console.warn('[link-preview] microlink fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchPreview(rawUrl: string): Promise<LinkPreviewData | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!isAllowedUrl(parsed)) return null;

  // Try direct fetch first (fast, no external dependency)
  const direct = await fetchDirect(rawUrl, parsed);
  if (direct) return direct;

  // Fallback to Microlink for JS-rendered / bot-protected pages
  return fetchMicrolink(rawUrl, parsed);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rawUrl = request.nextUrl.searchParams.get('url');
  if (!rawUrl) {
    return NextResponse.json({ data: null });
  }

  const preview = await fetchPreview(rawUrl);
  return NextResponse.json(
    { data: preview },
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' } },
  );
}
