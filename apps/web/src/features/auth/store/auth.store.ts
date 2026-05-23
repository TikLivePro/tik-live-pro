import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserId, SubscriptionTier } from '@tik-live-pro/shared-types';

interface AuthState {
  userId: UserId | null;
  accessToken: string | null;
  refreshToken: string | null;
  subscriptionTier: SubscriptionTier | null;
  displayName: string | null;
  email: string | null;
  isAuthenticated: boolean;
  setAuth: (params: {
    userId: UserId;
    accessToken: string;
    refreshToken: string;
    subscriptionTier: SubscriptionTier;
    displayName?: string;
    email?: string;
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
      refreshToken: null,
      subscriptionTier: null,
      displayName: null,
      email: null,
      isAuthenticated: false,
      setAuth: ({ userId, accessToken, refreshToken, subscriptionTier, displayName, email }) =>
        set({ userId, accessToken, refreshToken, subscriptionTier, displayName: displayName ?? null, email: email ?? null, isAuthenticated: true }),
      clearAuth: () =>
        set({
          userId: null,
          accessToken: null,
          refreshToken: null,
          subscriptionTier: null,
          displayName: null,
          email: null,
          isAuthenticated: false,
        }),
      updateAccessToken: (accessToken) => set({ accessToken }),
      updateProfile: ({ displayName, locale: _locale }) =>
        set((state) => ({ displayName: displayName ?? state.displayName })),
    }),
    {
      name: 'tik-live-pro-auth',
      partialize: (state) => ({
        userId: state.userId,
        refreshToken: state.refreshToken,
        subscriptionTier: state.subscriptionTier,
        displayName: state.displayName,
        email: state.email,
      }),
    },
  ),
);
