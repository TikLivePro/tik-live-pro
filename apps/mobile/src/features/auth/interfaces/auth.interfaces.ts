export type OAuthProvider = 'google' | 'facebook' | 'tiktok';

export interface SocialAuthState {
  loading: boolean;
  error: string | null;
}
