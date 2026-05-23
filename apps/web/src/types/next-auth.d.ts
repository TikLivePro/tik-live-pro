import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    appUserId?: string;
    appAccessToken?: string;
    appRefreshToken?: string;
    appSubscriptionTier?: string;
    appDisplayName?: string;
    appEmail?: string | null;
    error?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    appUserId?: string;
    appAccessToken?: string;
    appRefreshToken?: string;
    appSubscriptionTier?: string;
    appDisplayName?: string;
    appEmail?: string | null;
    appAccessTokenExpiresAt?: number;
    error?: string;
  }
}
