'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { API_BASE, apiFetch } from '@/lib/api';

interface UpdatePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function useUpdatePassword() {
  const t = useTranslations('settings.security');

  return useMutation({
    mutationFn: async (payload: UpdatePasswordPayload) => {
      const res = await apiFetch(`${API_BASE}/auth/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: { message: string } };
        throw new Error(err.error.message);
      }
    },
    onSuccess: () => {
      toast.success(t('passwordUpdated'));
    },
    onError: (err: Error) => {
      toast.error(err.message || t('passwordUpdateFailed'));
    },
  });
}
