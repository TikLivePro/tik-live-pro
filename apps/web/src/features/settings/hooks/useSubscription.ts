'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { API_BASE } from '@/lib/api';
import type { Subscription } from '@tik-live-pro/shared-types';

export function useSubscription() {
  const { accessToken } = useAuthStore();
  return useQuery<Subscription | null>({
    queryKey: ['subscription'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/billing/subscriptions/current`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to load subscription');
      const { data } = (await res.json()) as { data: Subscription };
      return data;
    },
    enabled: !!accessToken,
  });
}
