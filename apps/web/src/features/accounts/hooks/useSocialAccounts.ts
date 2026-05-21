'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { API_BASE } from '@/lib/api';
import type { SocialAccount, SocialPlatform } from '@tik-live-pro/shared-types';

export function useSocialAccounts(platform?: SocialPlatform) {
  const { accessToken } = useAuthStore();
  return useQuery<SocialAccount[], Error, SocialAccount[]>({
    queryKey: ['social-accounts'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/accounts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to load accounts');
      const { data } = (await res.json()) as { data: SocialAccount[] };
      return data;
    },
    enabled: !!accessToken,
    ...(platform && { select: (accounts: SocialAccount[]) => accounts.filter((a) => a.platform === platform) }),
  });
}
