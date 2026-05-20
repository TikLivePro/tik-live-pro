export type OAuthProvider = 'google' | 'facebook' | 'tiktok';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  displayName: string;
  locale?: string;
}
