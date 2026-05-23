'use client';

import { useAuthStore } from '../store/auth.store';

export function useProfile() {
  const { userId, displayName, email, subscriptionTier } = useAuthStore();
  return { userId, displayName, email, subscriptionTier };
}
