'use client';

import { useState, useCallback } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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

  const register = useCallback(
    async (params: RegisterCredentials) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error: { message: string } };
          throw new Error(err.error.message);
        }
        const { data } = (await res.json()) as { data: AuthResponse };
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
    async (params: LoginCredentials) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error: { message: string } };
          throw new Error(err.error.message);
        }
        const { data } = (await res.json()) as { data: AuthResponse };
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

  const loginWithProvider = useCallback(async (provider: OAuthProvider) => {
    setIsLoading(true);
    setError(null);
    await signIn(provider, { callbackUrl: '/auth/social-callback' });
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    router.push('/auth/login');
  }, [clearAuth, router]);

  return { register, login, loginWithProvider, logout, isLoading, error, isAuthenticated };
}
