import NextAuth, { type AuthOptions, type Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import type { Account } from 'next-auth';
import type { OAuthConfig } from 'next-auth/providers/oauth';
import FacebookProvider from 'next-auth/providers/facebook';
import GoogleProvider from 'next-auth/providers/google';

// ---------------------------------------------------------------------------
// Module augmentation — extend NextAuth's built-in Session and JWT types so
// TypeScript knows about the custom fields we attach in the callbacks below.
// ---------------------------------------------------------------------------
declare module 'next-auth' {
  interface Session {
    appUserId?: string;
    appAccessToken?: string;
    appRefreshToken?: string;
    appSubscriptionTier?: string;
    error?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    appUserId?: string;
    appAccessToken?: string;
    appRefreshToken?: string;
    appSubscriptionTier?: string;
    error?: string;
  }
}

// ---------------------------------------------------------------------------
// TikTok does not have a built-in NextAuth provider.
// Their OAuth 2.0 uses `client_key` instead of `client_id` at the auth step.
// ---------------------------------------------------------------------------
const TikTok: OAuthConfig<{
  open_id?: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}> = {
  id: 'tiktok',
  name: 'TikTok',
  type: 'oauth',
  authorization: {
    url: 'https://www.tiktok.com/v2/auth/authorize',
    params: {
      client_key: process.env['TIKTOK_CLIENT_KEY'],
      scope: 'user.info.basic,user.info.email',
      response_type: 'code',
    },
  },
  token: {
    url: 'https://open.tiktokapis.com/v2/oauth/token/',
    async request(context) {
      const params = new URLSearchParams({
        client_key: process.env['TIKTOK_CLIENT_KEY'] ?? '',
        client_secret: process.env['TIKTOK_CLIENT_SECRET'] ?? '',
        code: context.params.code ?? '',
        grant_type: 'authorization_code',
        redirect_uri: context.provider.callbackUrl,
      });
      const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = (await res.json()) as {
        access_token?: string;
        token_type?: string;
        expires_in?: number;
        refresh_token?: string;
        scope?: string;
      };
      return { tokens: data };
    },
  },
  userinfo: {
    url: 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,email',
    async request({ tokens }) {
      const res = await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,email',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      const data = (await res.json()) as {
        data?: { user?: Record<string, string> };
      };
      return data.data?.user ?? {};
    },
  },
  profile(profile) {
    return {
      id: profile.open_id ?? '',
      name: profile.display_name ?? 'TikTok User',
      email: profile.email ?? null,
      image: profile.avatar_url ?? null,
    };
  },
  clientId: process.env['TIKTOK_CLIENT_KEY'],
  clientSecret: process.env['TIKTOK_CLIENT_SECRET'],
  checks: ['state'],
} as OAuthConfig<{ open_id?: string; display_name?: string; email?: string; avatar_url?: string }>;

const AUTH_SERVICE_URL = process.env['AUTH_SERVICE_INTERNAL_URL'] ?? 'http://localhost:3001';

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
      clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
    }),
    FacebookProvider({
      clientId: process.env['FACEBOOK_APP_ID'] ?? '',
      clientSecret: process.env['FACEBOOK_APP_SECRET'] ?? '',
    }),
    TikTok,
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },
  callbacks: {
    async jwt({ token, account }: { token: JWT; account: Account | null }) {
      if (account?.access_token) {
        try {
          const res = await fetch(`${AUTH_SERVICE_URL}/auth/oauth/social`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: account.provider,
              accessToken: account.access_token,
            }),
          });
          if (!res.ok) {
            token.error = 'OAuthExchangeFailed';
            return token;
          }
          const json = (await res.json()) as {
            data: {
              userId: string;
              accessToken: string;
              refreshToken: string;
              subscriptionTier: string;
            };
          };
          token.appUserId = json.data.userId;
          token.appAccessToken = json.data.accessToken;
          token.appRefreshToken = json.data.refreshToken;
          token.appSubscriptionTier = json.data.subscriptionTier;
        } catch {
          token.error = 'OAuthExchangeFailed';
        }
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      // exactOptionalPropertyTypes: only assign when the value is defined,
      // otherwise leave the property absent on the session object entirely.
      if (token.appUserId !== undefined) session.appUserId = token.appUserId;
      if (token.appAccessToken !== undefined) session.appAccessToken = token.appAccessToken;
      if (token.appRefreshToken !== undefined) session.appRefreshToken = token.appRefreshToken;
      if (token.appSubscriptionTier !== undefined)
        session.appSubscriptionTier = token.appSubscriptionTier;
      if (token.error !== undefined) session.error = token.error;
      return session;
    },
  },
};

export default NextAuth(authOptions);
