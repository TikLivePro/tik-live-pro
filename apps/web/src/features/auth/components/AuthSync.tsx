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
  const updateTokens = useAuthStore((s) => s.updateTokens);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      if (refreshToken && !accessToken) {
        // Email/password user whose access token was not persisted (expected after page reload).
        // Silently exchange the stored refresh token for a fresh pair before clearing anything.
        void fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
          .then(async (res) => {
            if (!res.ok) {
              clearAuth();
              return;
            }
            const { data } = (await res.json()) as {
              data: { accessToken: string; refreshToken: string };
            };
            updateTokens(data.accessToken, data.refreshToken);
          })
          .catch(() => clearAuth());
      } else if (!refreshToken) {
        clearAuth();
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
  }, [session, status, accessToken, refreshToken, setAuth, updateTokens, clearAuth]);

  return null;
}
