'use client';

import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { API_BASE } from '@/lib/api';

interface UpdatePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function useUpdatePassword() {
  const { accessToken } = useAuthStore();

  return useMutation({
    mutationFn: async (payload: UpdatePasswordPayload) => {
      const res = await fetch(`${API_BASE}/auth/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: { message: string } };
        throw new Error(err.error.message);
      }
    },
  });
}
