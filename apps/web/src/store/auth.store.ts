import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserId, SubscriptionTier } from '@tik-live-pro/shared-types';

interface AuthState {
  userId: UserId | null;
  accessToken: string | null;
  refreshToken: string | null;
  subscriptionTier: SubscriptionTier | null;
  isAuthenticated: boolean;
  setAuth: (params: {
    userId: UserId;
    accessToken: string;
    refreshToken: string;
    subscriptionTier: SubscriptionTier;
  }) => void;
  clearAuth: () => void;
  updateAccessToken: (accessToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      accessToken: null,
      refreshToken: null,
      subscriptionTier: null,
      isAuthenticated: false,
      setAuth: ({ userId, accessToken, refreshToken, subscriptionTier }) =>
        set({ userId, accessToken, refreshToken, subscriptionTier, isAuthenticated: true }),
      clearAuth: () =>
        set({
          userId: null,
          accessToken: null,
          refreshToken: null,
          subscriptionTier: null,
          isAuthenticated: false,
        }),
      updateAccessToken: (accessToken) => set({ accessToken }),
    }),
    {
      name: 'tik-live-pro-auth',
      partialize: (state) => ({
        userId: state.userId,
        refreshToken: state.refreshToken,
        subscriptionTier: state.subscriptionTier,
      }),
    },
  ),
);
