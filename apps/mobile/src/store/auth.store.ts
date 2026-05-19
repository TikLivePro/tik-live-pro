import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import type { UserId, SubscriptionTier } from '@tik-live-pro/shared-types';

const storage = new MMKV({ id: 'tik-live-pro-auth' });

const mmkvStorage = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

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
    }),
    {
      name: 'auth',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        userId: state.userId,
        refreshToken: state.refreshToken,
        subscriptionTier: state.subscriptionTier,
      }),
    },
  ),
);
