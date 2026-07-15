'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { API_BASE, apiFetch } from '@/lib/api';

export function useConnectFacebook(): () => void {
  const t = useTranslations('accounts.errors');

  return () => {
    void apiFetch(`${API_BASE}/integrations/oauth/facebook/start`)
      .then(async (r) => {
        if (!r.ok) throw new Error('connect_failed');
        const body = (await r.json()) as { data?: { authUrl?: string } };
        if (!body.data?.authUrl) throw new Error('connect_failed');
        window.location.href = body.data.authUrl;
      })
      .catch(() => {
        toast.error(t('connectFailed'));
      });
  };
}
