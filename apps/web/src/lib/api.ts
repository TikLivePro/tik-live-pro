import { useAuthStore } from '@/features/auth/store/auth.store';

export const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';
export const COMMENTS_WS_URL = process.env['NEXT_PUBLIC_COMMENTS_WS_URL'] ?? 'http://localhost:3006';

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
    if (typeof window !== 'undefined') window.location.href = '/auth/login';
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
    if (typeof window !== 'undefined') window.location.href = '/auth/login';
    return res;
  }

  return makeRequest(newToken);
}
