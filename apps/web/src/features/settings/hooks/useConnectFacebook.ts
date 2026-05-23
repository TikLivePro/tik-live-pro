'use client';

import { useAuthStore } from '@/features/auth/store/auth.store';
import { API_BASE } from '@/lib/api';

export function useConnectFacebook(): () => void {
  const { accessToken } = useAuthStore();
  return () => {
    void fetch(`${API_BASE}/integrations/connect/facebook`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((body: unknown) => {
        const { data } = body as { data: { authUrl: string } };
        window.location.href = data.authUrl;
      });
  };
}
