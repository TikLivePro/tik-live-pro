'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useAuthStore } from '../store/auth.store';
import { silentRefresh } from '@/lib/api';
import { useTokenRefresh } from '../hooks/useTokenRefresh';
import type { UserId, SubscriptionTier } from '@tik-live-pro/shared-types';

export function AuthSync() {
  const { data: session, status } = useSession();
  const accessToken = useAuthStore((s) => s.accessToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useTokenRefresh();

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      if (!accessToken) {
        // Attempt a silent refresh via the httpOnly cookie.
        // If the cookie is absent or expired, silentRefresh() returns null and we clear auth.
        void silentRefresh().then((token) => { if (!token) clearAuth(); });
      }
      return;
    }

    // OAuth case: NextAuth session is available but in-memory access token is missing.
    if (session?.appAccessToken && session.appUserId && !accessToken) {
      setAuth({
        userId: session.appUserId as UserId,
        accessToken: session.appAccessToken,
        subscriptionTier: (session.appSubscriptionTier ?? 'free') as SubscriptionTier,
        ...(session.appDisplayName !== undefined ? { displayName: session.appDisplayName } : {}),
        ...(session.appEmail !== undefined ? { email: session.appEmail } : {}),
        ...(session.appAvatarUrl !== undefined ? { avatarUrl: session.appAvatarUrl } : {}),
      });
    }
  }, [session, status, accessToken, setAuth, clearAuth]);

  return null;
}
