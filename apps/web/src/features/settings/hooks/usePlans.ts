'use client';

import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '@/lib/api';
import type { Plan } from '@tik-live-pro/shared-types';

export function usePlans() {
  return useQuery<Plan[]>({
    queryKey: ['billing-plans'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/billing/plans`);
      if (!res.ok) throw new Error('Failed to load plans');
      const { data } = (await res.json()) as { data: Plan[] };
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
