'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import type { UserId, SubscriptionTier } from '@tik-live-pro/shared-types';

export default function SocialCallbackPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s: ReturnType<typeof useAuthStore.getState>) => s.setAuth);

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated' || !session) {
      router.replace('/auth/login?error=oauth_failed');
      return;
    }

    if (session.error === 'OAuthExchangeFailed') {
      router.replace('/auth/login?error=oauth_failed');
      return;
    }

    if (session.appAccessToken && session.appUserId) {
      setAuth({
        userId: session.appUserId as UserId,
        accessToken: session.appAccessToken,
        refreshToken: session.appRefreshToken ?? '',
        subscriptionTier: (session.appSubscriptionTier ?? 'free') as SubscriptionTier,
        ...(session.appDisplayName !== undefined ? { displayName: session.appDisplayName } : {}),
        ...(session.appEmail !== undefined ? { email: session.appEmail } : {}),
      });
      const next = searchParams.get('next') ?? '/dashboard';
      router.replace(next);
    }
  }, [session, status, setAuth, router, searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
