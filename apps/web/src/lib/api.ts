import { useAuthStore } from '@/features/auth/store/auth.store';

export const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

export interface VideoProxyResolveResult {
  resolvedUrl: string;
  /**
   * Audio-only CDN URL — present only for DASH streams where video and audio
   * are separate.  When set, use the merge-stream endpoint to play both.
   */
  audioUrl?: string;
  title: string;
  /** All video heights available (DASH + combined), sorted descending. */
  availableHeights: number[];
}

export async function resolveVideoProxyUrl(
  platformUrl: string,
  height?: number,
): Promise<VideoProxyResolveResult> {
  const body: Record<string, unknown> = { url: platformUrl };
  if (height !== undefined) body['height'] = height;
  const res = await apiFetch(`${API_BASE}/stream-orchestrator/video-proxy/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const responseBody = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(responseBody.message ?? 'Failed to resolve URL');
  }
  return (await res.json()) as VideoProxyResolveResult;
}
export const COMMENTS_WS_URL = process.env['NEXT_PUBLIC_COMMENTS_WS_URL'] ?? 'http://localhost:3006';

/**
 * Constructs the URL the browser uses to play a DASH (separate video+audio) stream.
 * Routes through the same-origin Next.js /api/video-stream proxy so captureStream()
 * works and the URL is never localhost-dependent on the client.
 */
export function buildMergeStreamUrl(resolvedUrl: string, audioUrl: string): string {
  const backendUrl =
    `${API_BASE}/stream-orchestrator/video-proxy/merge-stream` +
    `?v=${encodeURIComponent(resolvedUrl)}&a=${encodeURIComponent(audioUrl)}`;
  return `/api/video-stream?url=${encodeURIComponent(backendUrl)}`;
}

// Deduplicates concurrent refresh calls so only one refresh request is in-flight at a time.
// Token rotation means replaying an old refresh token returns 401, so serializing is required.
let refreshPromise: Promise<string | null> | null = null;

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const makeRequest = (token: string | null): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  const res = await makeRequest(useAuthStore.getState().accessToken);
  if (res.status !== 401) return res;

  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) {
    useAuthStore.getState().clearAuth();
    if (typeof window !== 'undefined') {
      const callbackUrl = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/auth/login?callbackUrl=${callbackUrl}`;
    }
    return res;
  }

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (r) => {
        if (!r.ok) return null;
        const { data } = (await r.json()) as { data: { accessToken: string; refreshToken: string } };
        useAuthStore.getState().updateTokens(data.accessToken, data.refreshToken);
        return data.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }

  const newToken = await refreshPromise;

  if (!newToken) {
    useAuthStore.getState().clearAuth();
    if (typeof window !== 'undefined') {
      const callbackUrl = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/auth/login?callbackUrl=${callbackUrl}`;
    }
    return res;
  }

  return makeRequest(newToken);
}
