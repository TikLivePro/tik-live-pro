import { useCallback, useState } from 'react';
import { authorize } from 'react-native-app-auth';
import { useAuthStore } from '@/store/auth.store';
import { OAUTH_CONFIGS } from '../consts/auth.consts';
import { API_BASE } from '@/lib/api';
import type { OAuthProvider, SocialAuthState } from '../interfaces/auth.interfaces';
import type { UserId, SubscriptionTier } from '@tik-live-pro/shared-types';

export type { OAuthProvider };

export function useSocialAuth() {
  const [state, setState] = useState<SocialAuthState>({ loading: false, error: null });
  const setAuth = useAuthStore((s) => s.setAuth);

  const loginWithProvider = useCallback(
    async (provider: OAuthProvider) => {
      setState({ loading: true, error: null });
      try {
        const result = await authorize(OAUTH_CONFIGS[provider]);

        const res = await fetch(`${API_BASE}/auth/oauth/social`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, accessToken: result.accessToken }),
        });

        if (!res.ok) {
          const body = (await res.json()) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? 'OAuth login failed');
        }

        const { data } = (await res.json()) as {
          data: { userId: UserId; accessToken: string; refreshToken: string; subscriptionTier: SubscriptionTier };
        };

        setAuth(data);
      } catch (err) {
        const message =
          err instanceof Error && err.message !== 'User cancelled flow'
            ? err.message
            : 'Social login failed';
        setState({ loading: false, error: message });
        return;
      }
      setState({ loading: false, error: null });
    },
    [setAuth],
  );

  return { loginWithProvider, ...state };
}
