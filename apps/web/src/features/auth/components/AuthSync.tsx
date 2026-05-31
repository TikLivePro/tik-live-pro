'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useAuthStore } from '../store/auth.store';
import type { UserId, SubscriptionTier } from '@tik-live-pro/shared-types';

export function AuthSync() {
  const { data: session, status } = useSession();
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      // Email/password users have no NextAuth session. If a refreshToken is present in the
      // store, leave it alone — apiFetch already handles the lazy 401→refresh→retry cycle.
      // Calling refresh here races with apiFetch's own refresh and causes both to fire the
      // same refreshToken; with token rotation the losing call gets 401 and clears auth.
      if (!refreshToken) {
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
  }, [session, status, accessToken, refreshToken, setAuth, clearAuth]);

  return null;
}
