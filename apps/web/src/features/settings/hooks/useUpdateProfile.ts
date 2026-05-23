'use client';

import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { API_BASE } from '@/lib/api';

interface UpdateProfilePayload {
  displayName?: string;
  locale?: string;
}

export function useUpdateProfile() {
  const { accessToken, updateProfile } = useAuthStore();

  return useMutation({
    mutationFn: async (payload: UpdateProfilePayload) => {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update profile');
      const { data } = (await res.json()) as { data: { displayName: string; locale: string } };
      return data;
    },
    onSuccess: (data) => {
      updateProfile({ displayName: data.displayName, locale: data.locale });
    },
  });
}
