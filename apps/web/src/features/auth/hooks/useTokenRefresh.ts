'use client';

import { useEffect } from 'react';
import { useAuthStore } from '../store/auth.store';
import { silentRefresh } from '@/lib/api';

// Refresh 60 s before the access token expires so active sessions never hit a 401.
const REFRESH_BEFORE_EXPIRY_MS = 60_000;

/**
 * Mount this hook once at the app root (inside AuthSync's parent layout).
 * It schedules a background refresh whenever the access token is about to expire,
 * and clears auth if the refresh token has itself expired.
 */
export function useTokenRefresh(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessTokenExpiresAt = useAuthStore((s) => s.accessTokenExpiresAt);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useEffect(() => {
    if (!isAuthenticated || !accessTokenExpiresAt) return;

    const delay = accessTokenExpiresAt - Date.now() - REFRESH_BEFORE_EXPIRY_MS;

    if (delay <= 0) {
      // Token already expired or about to — refresh immediately.
      void silentRefresh().then((token) => { if (!token) clearAuth(); });
      return;
    }

    const timerId = setTimeout(() => {
      void silentRefresh().then((token) => { if (!token) clearAuth(); });
    }, delay);

    return () => clearTimeout(timerId);
  }, [isAuthenticated, accessTokenExpiresAt, clearAuth]);
}
