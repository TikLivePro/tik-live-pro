'use client';

import { useCallback, useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '../store/auth.store';
import { LAST_OAUTH_PROVIDER_STORAGE_KEY, OAUTH_PROVIDERS } from '../consts/auth.consts';
import type { OAuthProvider } from '../interfaces/auth.interfaces';
import type { UserId, SubscriptionTier } from '@tik-live-pro/shared-types';

export type SocialCallbackState = 'connecting' | 'failed';

interface UseSocialCallbackResult {
  state: SocialCallbackState;
  retry: () => void;
  backToLogin: () => void;
}

function readLastProvider(): OAuthProvider | null {
  try {
    const stored = sessionStorage.getItem(LAST_OAUTH_PROVIDER_STORAGE_KEY);
    return stored && (OAUTH_PROVIDERS as string[]).includes(stored) ? (stored as OAuthProvider) : null;
  } catch {
    return null;
  }
}

export function useSocialCallback(): UseSocialCallbackResult {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s: ReturnType<typeof useAuthStore.getState>) => s.setAuth);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed || status === 'loading') return;

    if (status === 'unauthenticated' || !session || session.error === 'OAuthExchangeFailed') {
      setFailed(true);
      return;
    }

    if (session.appAccessToken && session.appUserId) {
      const proceed = async (): Promise<void> => {
        // Write the httpOnly cookie before navigating away so it is available on the next request.
        if (session.appRefreshToken) {
          await fetch('/api/auth/session/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: session.appRefreshToken }),
          });
        }
        setAuth({
          userId: session.appUserId as UserId,
          accessToken: session.appAccessToken as string,
          subscriptionTier: (session.appSubscriptionTier ?? 'free') as SubscriptionTier,
          ...(session.appDisplayName !== undefined ? { displayName: session.appDisplayName as string } : {}),
          ...(session.appEmail !== undefined ? { email: session.appEmail as string } : {}),
          ...(session.appAvatarUrl !== undefined ? { avatarUrl: session.appAvatarUrl } : {}),
        });
        const rawNext = searchParams.get('next') ?? '/dashboard';
        const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';
        router.replace(next);
      };
      void proceed();
      return;
    }

    // Session is authenticated but tokens are missing — the auth service exchange failed
    // without setting session.error (e.g. unexpected response shape).
    setFailed(true);
  }, [session, status, failed, setAuth, router, searchParams]);

  const retry = useCallback((): void => {
    const provider = readLastProvider();
    if (!provider) {
      router.replace('/auth/login');
      return;
    }
    const rawNext = searchParams.get('next');
    const callbackUrl = rawNext
      ? `/auth/social-callback?next=${encodeURIComponent(rawNext)}`
      : '/auth/social-callback';
    setFailed(false);
    void signIn(provider, { callbackUrl });
  }, [router, searchParams]);

  const backToLogin = useCallback((): void => {
    router.replace('/auth/login');
  }, [router]);

  return { state: failed ? 'failed' : 'connecting', retry, backToLogin };
}
