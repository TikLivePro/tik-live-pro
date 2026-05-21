import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { API_BASE } from '@/lib/api';
import { useSocialAccounts } from '@/features/stream/hooks/useSocialAccounts';

export function useTikTokAccounts() {
  return useSocialAccounts('tiktok');
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
