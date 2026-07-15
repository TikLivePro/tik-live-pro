'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth';
import { API_BASE, apiFetch } from '@/lib/api';

/**
 * Permanently deletes the account via DELETE /users/me, then logs out.
 * A 409 means a live session is still running — surface that specifically.
 */
export function useDeleteAccount(): UseMutationResult<void, Error, void> {
  const t = useTranslations('settings.security.danger');
  const { logout } = useAuth();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const res = await apiFetch(`${API_BASE}/users/me`, { method: 'DELETE' });
      if (res.status === 409) throw new Error(t('liveSessionError'));
      if (!res.ok) throw new Error(t('failed'));
    },
    onSuccess: () => {
      toast.success(t('deleted'));
      void logout();
    },
    onError: (err: Error) => {
      toast.error(err.message || t('failed'));
    },
  });
}
