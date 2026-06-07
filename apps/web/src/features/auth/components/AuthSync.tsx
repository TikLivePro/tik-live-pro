'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useAuthStore } from '../store/auth.store';
import { API_BASE } from '@/lib/api';
import type { UserId, SubscriptionTier } from '@tik-live-pro/shared-types';

export function AuthSync() {
  const { data: session, status } = useSession();
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const updateTokens = useAuthStore((s) => s.updateTokens);

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      if (!refreshToken) {
        clearAuth();
        return;
      }
      // Email/password user: refresh token is persisted but access token is lost on page
      // reload. Silently restore it so the socket and first API call both work immediately.
      if (!accessToken) {
        void fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        }).then(async (r) => {
          if (!r.ok) { clearAuth(); return; }
          const { data } = (await r.json()) as { data: { accessToken: string; refreshToken: string } };
          updateTokens(data.accessToken, data.refreshToken);
        }).catch(() => clearAuth());
      }
      return;
    }

    if (session?.appAccessToken && session.appUserId && !accessToken) {
      setAuth({
        userId: session.appUserId as UserId,
        accessToken: session.appAccessToken,
        refreshToken: session.appRefreshToken ?? '',
        subscriptionTier: (session.appSubscriptionTier ?? 'free') as SubscriptionTier,
        ...(session.appDisplayName !== undefined ? { displayName: session.appDisplayName } : {}),
        ...(session.appEmail !== undefined ? { email: session.appEmail } : {}),
      });
    }
  }, [session, status, accessToken, refreshToken, setAuth, clearAuth, updateTokens]);

  return null;
}
