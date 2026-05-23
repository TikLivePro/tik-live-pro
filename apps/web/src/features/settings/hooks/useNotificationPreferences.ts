'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationPreferences {
  streamStarted: boolean;
  streamEnded: boolean;
  accountConnected: boolean;
  paymentFailed: boolean;
}

interface NotificationPreferencesStore extends NotificationPreferences {
  toggle: (key: keyof NotificationPreferences) => void;
}

export const useNotificationPreferences = create<NotificationPreferencesStore>()(
  persist(
    (set) => ({
      streamStarted: true,
      streamEnded: true,
      accountConnected: true,
      paymentFailed: true,
      toggle: (key) => set((state) => ({ [key]: !state[key] })),
    }),
    { name: 'tik-live-pro-notifications' },
  ),
);
