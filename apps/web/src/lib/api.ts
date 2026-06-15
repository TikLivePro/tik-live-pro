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
 * Constructs the same-origin URL the browser uses to play a DASH (video+audio)
 * stream. Points at the dedicated Next.js merge-stream proxy route so the URL
 * is fully independent of NEXT_PUBLIC_API_URL and captureStream() works without
 * cross-origin restrictions. The proxy resolves the backend internally via
 * STREAM_ORCHESTRATOR_INTERNAL_URL (server-side env var).
 */
export function buildMergeStreamUrl(resolvedUrl: string, audioUrl: string): string {
  return (
    `/api/video-proxy/merge-stream` +
    `?v=${encodeURIComponent(resolvedUrl)}&a=${encodeURIComponent(audioUrl)}`
  );
}

// Deduplicates concurrent refresh calls — only one request is ever in-flight at a time.
// Token rotation means replaying an old refresh token returns 401, so serializing is required.
let refreshPromise: Promise<string | null> | null = null;

function redirectToLogin(): void {
  if (typeof window !== 'undefined') {
    const callbackUrl = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/auth/login?callbackUrl=${callbackUrl}`;
  }
}

/**
 * Silently obtain a new access token via the httpOnly refresh_token cookie.
 * All callers share one in-flight request — token rotation is safe because
 * concurrent calls wait for the same promise rather than each firing separately.
 *
 * Returns the new access token on success, or null when the cookie is absent,
 * expired, or revoked (the caller should treat null as a logout signal).
 */
export function silentRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/session/refresh', { method: 'POST' })
      .then(async (r) => {
        if (!r.ok) return null;
        const { accessToken } = (await r.json()) as { accessToken: string };
        useAuthStore.getState().updateAccessToken(accessToken);
        return accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const makeRequest = (token: string | null): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  const res = await makeRequest(useAuthStore.getState().accessToken);
  if (res.status !== 401) return res;

  const newToken = await silentRefresh();

  if (!newToken) {
    useAuthStore.getState().clearAuth();
    redirectToLogin();
    return res;
  }

  return makeRequest(newToken);
}
