'use client';

import { useState, useCallback } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import type { SubscriptionTier, UserId } from '@tik-live-pro/shared-types';

export type OAuthProvider = 'google' | 'facebook' | 'tiktok';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { setAuth, clearAuth, isAuthenticated } = useAuthStore();

  const register = useCallback(
    async (params: { email: string; password: string; displayName: string; locale?: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (!res.ok) {
          const err = await res.json() as { error: { message: string } };
          throw new Error(err.error.message);
        }
        const { data } = await res.json() as {
          data: {
            userId: UserId;
            accessToken: string;
            refreshToken: string;
            subscriptionTier: SubscriptionTier;
          };
        };
        setAuth(data);
        router.push('/dashboard');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed');
      } finally {
        setIsLoading(false);
      }
    },
    [setAuth, router],
  );

  const login = useCallback(
    async (params: { email: string; password: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (!res.ok) {
          const err = await res.json() as { error: { message: string } };
          throw new Error(err.error.message);
        }
        const { data } = await res.json() as {
          data: {
            userId: UserId;
            accessToken: string;
            refreshToken: string;
            subscriptionTier: SubscriptionTier;
          };
        };
        setAuth(data);
        router.push('/dashboard');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setIsLoading(false);
      }
    },
    [setAuth, router],
  );

  const loginWithProvider = useCallback(
    async (provider: OAuthProvider) => {
      setIsLoading(true);
      setError(null);
      await signIn(provider, { callbackUrl: '/auth/social-callback' });
      // signIn() redirects — code below only runs on error
      setIsLoading(false);
    },
    [],
  );

  const logout = useCallback(() => {
    clearAuth();
    router.push('/auth/login');
  }, [clearAuth, router]);

  return { register, login, loginWithProvider, logout, isLoading, error, isAuthenticated };
}
