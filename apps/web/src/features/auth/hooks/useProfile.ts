'use client';

import { useAuthStore } from '../store/auth.store';

export function useProfile() {
  const { userId, displayName, email, avatarUrl, subscriptionTier } = useAuthStore();
  return { userId, displayName, email, avatarUrl, subscriptionTier };
}
