import { useCallback, useState } from 'react';
import { authorize } from 'react-native-app-auth';
import type { AuthConfiguration } from 'react-native-app-auth';
import { useAuthStore } from '@/store/auth.store';
import type { UserId, SubscriptionTier } from '@tik-live-pro/shared-types';

const API_BASE = process.env['API_BASE_URL'] ?? 'http://10.0.2.2:3000';

// Redirect URI scheme registered in AndroidManifest.xml and iOS Info.plist
const REDIRECT_URI = 'com.tiklivepro:/oauth2redirect';

const GOOGLE_CONFIG: AuthConfiguration = {
  issuer: 'https://accounts.google.com',
  clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
  redirectUrl: `${REDIRECT_URI}/google`,
  scopes: ['openid', 'profile', 'email'],
};

const FACEBOOK_CONFIG: AuthConfiguration = {
  issuer: undefined,
  serviceConfiguration: {
    authorizationEndpoint: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenEndpoint: 'https://graph.facebook.com/v21.0/oauth/access_token',
  },
  clientId: process.env['FACEBOOK_APP_ID'] ?? '',
  redirectUrl: `fb${process.env['FACEBOOK_APP_ID'] ?? ''}://authorize`,
  scopes: ['public_profile', 'email'],
};

// TikTok requires `client_key` in the authorization URL.
// Passing it through additionalParameters ensures the correct param name.
const TIKTOK_CONFIG: AuthConfiguration = {
  issuer: undefined,
  serviceConfiguration: {
    authorizationEndpoint: 'https://www.tiktok.com/v2/auth/authorize',
    tokenEndpoint: 'https://open.tiktokapis.com/v2/oauth/token/',
  },
  clientId: process.env['TIKTOK_CLIENT_KEY'] ?? '',
  clientSecret: process.env['TIKTOK_CLIENT_SECRET'] ?? '',
  redirectUrl: `${REDIRECT_URI}/tiktok`,
  scopes: ['user.info.basic'],
  additionalParameters: {
    client_key: process.env['TIKTOK_CLIENT_KEY'] ?? '',
  },
};

const CONFIGS = {
  google: GOOGLE_CONFIG,
  facebook: FACEBOOK_CONFIG,
  tiktok: TIKTOK_CONFIG,
} as const;

export type OAuthProvider = keyof typeof CONFIGS;

interface SocialAuthState {
  loading: boolean;
  error: string | null;
}

export function useSocialAuth() {
  const [state, setState] = useState<SocialAuthState>({ loading: false, error: null });
  const setAuth = useAuthStore((s) => s.setAuth);

  const loginWithProvider = useCallback(
    async (provider: OAuthProvider) => {
      setState({ loading: true, error: null });
      try {
        const result = await authorize(CONFIGS[provider]);

        const res = await fetch(`${API_BASE}/auth/oauth/social`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            accessToken: result.accessToken,
          }),
        });

        if (!res.ok) {
          const body = (await res.json()) as { error?: { message?: string } };
          throw new Error(body.error?.message ?? 'OAuth login failed');
        }

        const { data } = (await res.json()) as {
          data: {
            userId: UserId;
            accessToken: string;
            refreshToken: string;
            subscriptionTier: SubscriptionTier;
          };
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
