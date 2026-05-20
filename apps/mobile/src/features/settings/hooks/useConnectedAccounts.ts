import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { API_BASE } from '@/lib/api';
import type { SocialAccount } from '@tik-live-pro/shared-types';

export function useTikTokAccounts() {
  const { accessToken } = useAuthStore();
  return useQuery<SocialAccount[]>({
    queryKey: ['social-accounts'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/accounts`, {
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (!res.ok) throw new Error('Failed to load accounts');
      const { data } = (await res.json()) as { data: SocialAccount[] };
      return data;
    },
    enabled: !!accessToken,
    select: (accounts) => accounts.filter((a) => a.platform === 'tiktok'),
  });
}

export function useRemoveAccount() {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      const res = await fetch(`${API_BASE}/integrations/accounts/${accountId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (!res.ok) throw new Error('Failed to remove account');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['social-accounts'] });
    },
  });
}
