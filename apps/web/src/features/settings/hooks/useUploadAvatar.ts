'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { API_BASE, apiFetch } from '@/lib/api';
import { AVATAR_MAX_BYTES } from '../consts/settings.consts';

/** Uploads a profile picture to POST /users/me/avatar and syncs the auth store. */
export function useUploadAvatar(): UseMutationResult<string, Error, File> {
  const { updateProfile } = useAuthStore();
  const t = useTranslations('settings.profile');

  return useMutation<string, Error, File>({
    mutationFn: async (file: File) => {
      if (file.size > AVATAR_MAX_BYTES) {
        throw new Error(t('avatarTooLarge'));
      }
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch(`${API_BASE}/users/me/avatar`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(t('avatarUploadFailed'));
      const { data } = (await res.json()) as { data: { avatarUrl: string } };
      return data.avatarUrl;
    },
    onSuccess: (avatarUrl) => {
      updateProfile({ avatarUrl });
      toast.success(t('avatarUploaded'));
    },
    onError: (err: Error) => {
      toast.error(err.message || t('avatarUploadFailed'));
    },
  });
}
