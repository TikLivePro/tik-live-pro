'use client';

import { useEffect, useRef, useState } from 'react';
import type { LinkPreviewData } from '../interfaces/link-preview.interfaces';

export type { LinkPreviewData };

export interface LinkPreviewItem {
  url: string;
  data: LinkPreviewData | null;
  loading: boolean;
  dismiss: () => void;
}

const URL_RE_GLOBAL = /https?:\/\/[^\s<>"']+/g;

// Module-level cache — each URL is fetched at most once per session
const cache = new Map<string, LinkPreviewData | null>();

function extractAllUrls(text: string): string[] {
  const matches = text.match(URL_RE_GLOBAL) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;!?)]+$/, '');
    if (!seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }
  return result;
}

async function fetchPreview(url: string): Promise<LinkPreviewData | null> {
  if (cache.has(url)) return cache.get(url) ?? null;
  try {
    const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      cache.set(url, null);
      return null;
    }
    const body = (await res.json()) as { data: LinkPreviewData | null };
    cache.set(url, body.data);
    return body.data;
  } catch (err) {
    console.warn('[useLinkPreview] fetch failed:', err);
    cache.set(url, null);
    return null;
  }
}

export function useLinkPreview(text: string, enabled = true) {
  const [localPreviews, setLocalPreviews] = useState<Map<string, LinkPreviewData | null>>(new Map());
  const [loadingUrls, setLoadingUrls] = useState<Set<string>>(new Set());
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const allUrls = extractAllUrls(text);
  const activeUrls = enabled ? allUrls.filter((url) => !dismissedUrls.has(url)) : [];
  const urlsKey = activeUrls.join('\n');

  useEffect(() => {
    if (!enabled) {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
      return;
    }

    const currentSet = new Set(activeUrls);

    // Cancel timers for URLs no longer in the text
    for (const [url, timer] of timersRef.current.entries()) {
      if (!currentSet.has(url)) {
        clearTimeout(timer);
        timersRef.current.delete(url);
      }
    }

    // Schedule fetches for new URLs
    for (const url of activeUrls) {
      if (localPreviews.has(url) || timersRef.current.has(url)) continue;

      if (cache.has(url)) {
        setLocalPreviews((prev) => new Map(prev).set(url, cache.get(url) ?? null));
        continue;
      }

      const timer = setTimeout(() => {
        timersRef.current.delete(url);
        setLoadingUrls((prev) => new Set(prev).add(url));
        void fetchPreview(url).then((data) => {
          setLocalPreviews((prev) => new Map(prev).set(url, data));
          setLoadingUrls((prev) => {
            const s = new Set(prev);
            s.delete(url);
            return s;
          });
        });
      }, 600);
      timersRef.current.set(url, timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlsKey, enabled]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, []);

  const dismiss = (url: string) => {
    setDismissedUrls((prev) => new Set(prev).add(url));
    setLocalPreviews((prev) => {
      const m = new Map(prev);
      m.delete(url);
      return m;
    });
    setLoadingUrls((prev) => {
      const s = new Set(prev);
      s.delete(url);
      return s;
    });
    const timer = timersRef.current.get(url);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(url);
    }
  };

  const items: LinkPreviewItem[] = activeUrls.flatMap((url) => {
    const isLoading = loadingUrls.has(url);
    const data = localPreviews.has(url) ? (localPreviews.get(url) ?? null) : null;
    // Show skeleton while loading; show card if data loaded successfully; skip silently on failure
    if (!isLoading && !data) return [];
    return [{ url, data, loading: isLoading, dismiss: () => dismiss(url) }];
  });

  return { items };
}
