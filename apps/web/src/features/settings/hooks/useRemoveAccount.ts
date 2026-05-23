'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { API_BASE, apiFetch } from '@/lib/api';

export function useRemoveAccount() {
  const queryClient = useQueryClient();
  const t = useTranslations('settings.connectedAccounts');

  return useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiFetch(`${API_BASE}/integrations/accounts/${accountId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to remove account');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['social-accounts'] });
      toast.success(t('removed'));
    },
    onError: () => {
      toast.error(t('removeFailed'));
    },
  });
}
