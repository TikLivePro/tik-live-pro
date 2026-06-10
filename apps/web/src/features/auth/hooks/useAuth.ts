'use client';

import { useState, useCallback, useMemo } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '../store/auth.store';
import { API_BASE } from '@/lib/api';
import type { OAuthProvider, LoginCredentials, RegisterCredentials } from '../interfaces/auth.interfaces';
import type { SubscriptionTier, UserId } from '@tik-live-pro/shared-types';

export type { OAuthProvider };

interface AuthResponse {
  userId: UserId;
  accessToken: string;
  refreshToken: string;
  subscriptionTier: SubscriptionTier;
  displayName?: string;
  email?: string;
}

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { setAuth, clearAuth, isAuthenticated } = useAuthStore();
  const tAuth = useTranslations('auth');

  const errMap = useMemo<Record<string, string>>(
    () => ({
      CONFLICT: tAuth('errors.emailAlreadyExists'),
      EMAIL_TAKEN: tAuth('errors.emailAlreadyExists'),
      INVALID_CREDENTIALS: tAuth('errors.invalidCredentials'),
      UNAUTHORIZED: tAuth('errors.invalidCredentials'),
      VALIDATION_ERROR: tAuth('errors.weakPassword'),
    }),
    [tAuth],
  );

  const resolveError = useCallback(
    (code: string): string => errMap[code] ?? tAuth('errors.generic'),
    [errMap, tAuth],
  );

  const register = useCallback(
    async (params: RegisterCredentials, callbackUrl?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error: { code: string; message: string } };
          setError(resolveError(body.error.code));
          return;
        }
        const { data } = (await res.json()) as { data: AuthResponse };
        setAuth({ ...data, displayName: params.displayName, email: params.email });
        router.push(callbackUrl ?? '/dashboard');
      } catch {
        setError(tAuth('errors.generic'));
      } finally {
        setIsLoading(false);
      }
    },
    [setAuth, router, tAuth, resolveError],
  );

  const login = useCallback(
    async (params: LoginCredentials, callbackUrl?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error: { code: string; message: string } };
          setError(resolveError(body.error.code));
          return;
        }
        const { data } = (await res.json()) as { data: AuthResponse };
        setAuth({ ...data, email: params.email });
        router.push(callbackUrl ?? '/dashboard');
      } catch {
        setError(tAuth('errors.generic'));
      } finally {
        setIsLoading(false);
      }
    },
    [setAuth, router, tAuth, resolveError],
  );

  const loginWithProvider = useCallback(
    async (provider: OAuthProvider, callbackUrl?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const next = callbackUrl
          ? `/auth/social-callback?next=${encodeURIComponent(callbackUrl)}`
          : '/auth/social-callback';
        await signIn(provider, { callbackUrl: next });
      } catch {
        setError(tAuth('errors.oauthFailed'));
      } finally {
        setIsLoading(false);
      }
    },
    [tAuth],
  );

  const logout = useCallback(() => {
    clearAuth();
    router.push('/auth/login');
  }, [clearAuth, router]);

  return { register, login, loginWithProvider, logout, isLoading, error, isAuthenticated };
}
