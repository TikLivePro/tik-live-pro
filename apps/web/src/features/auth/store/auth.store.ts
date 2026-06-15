import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserId, SubscriptionTier } from '@tik-live-pro/shared-types';

// Access tokens live for 15 minutes; we schedule refresh 60 s before expiry.
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;

interface AuthState {
  userId: UserId | null;
  accessToken: string | null;
  /** Unix ms timestamp when the current access token expires. */
  accessTokenExpiresAt: number | null;
  subscriptionTier: SubscriptionTier | null;
  displayName: string | null;
  email: string | null;
  locale: string | null;
  isAuthenticated: boolean;
  setAuth: (params: {
    userId: UserId;
    accessToken: string;
    subscriptionTier: SubscriptionTier;
    displayName?: string;
    email?: string | null;
  }) => void;
  clearAuth: () => void;
  updateAccessToken: (accessToken: string) => void;
  updateProfile: (params: { displayName?: string; locale?: string }) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      accessToken: null,
      accessTokenExpiresAt: null,
      subscriptionTier: null,
      displayName: null,
      email: null,
      locale: null,
      isAuthenticated: false,
      setAuth: ({ userId, accessToken, subscriptionTier, displayName, email }) =>
        set({
          userId,
          accessToken,
          accessTokenExpiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
          subscriptionTier,
          displayName: displayName ?? null,
          email: email ?? null,
          isAuthenticated: true,
        }),
      clearAuth: () =>
        set({
          userId: null,
          accessToken: null,
          accessTokenExpiresAt: null,
          subscriptionTier: null,
          displayName: null,
          email: null,
          locale: null,
          isAuthenticated: false,
        }),
      updateAccessToken: (accessToken) =>
        set({ accessToken, accessTokenExpiresAt: Date.now() + ACCESS_TOKEN_TTL_MS }),
      updateProfile: ({ displayName, locale }) =>
        set((state) => ({
          displayName: displayName ?? state.displayName,
          locale: locale ?? state.locale,
        })),
    }),
    {
      name: 'tik-live-pro-auth',
      partialize: (state) => ({
        userId: state.userId,
        isAuthenticated: state.isAuthenticated,
        accessTokenExpiresAt: state.accessTokenExpiresAt,
        subscriptionTier: state.subscriptionTier,
        displayName: state.displayName,
        email: state.email,
        locale: state.locale,
      }),
    },
  ),
);
