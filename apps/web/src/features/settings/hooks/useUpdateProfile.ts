'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { API_BASE, apiFetch } from '@/lib/api';

interface UpdateProfilePayload {
  displayName?: string;
  locale?: string;
}

export function useUpdateProfile() {
  const { updateProfile } = useAuthStore();
  const t = useTranslations('settings.profile');

  return useMutation({
    mutationFn: async (payload: UpdateProfilePayload) => {
      const res = await apiFetch(`${API_BASE}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update profile');
      const { data } = (await res.json()) as { data: { displayName: string; locale: string } };
      return data;
    },
    onSuccess: (data) => {
      updateProfile({ displayName: data.displayName, locale: data.locale });
      toast.success(t('saved'));
    },
    onError: () => {
      toast.error(t('saveError'));
    },
  });
}
