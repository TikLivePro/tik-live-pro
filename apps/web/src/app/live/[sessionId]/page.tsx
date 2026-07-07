'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { API_BASE, apiFetch } from '@/lib/api';
import { useStreamStore } from '@/features/stream/store/stream.store';
import { FullscreenLiveView } from '@/features/stream/components/FullscreenLiveView';
import type { LiveSession, LiveSessionId } from '@tik-live-pro/shared-types';

import { CreatorLayout } from '@/components/CreatorLayout';

const TERMINAL_STATUSES = new Set(['ended', 'error']);

export default function LiveSessionPage(): React.ReactElement {
  const t = useTranslations('stream');
  const tCommon = useTranslations('common');
  const params = useParams();
  const router = useRouter();
  const sessionId = params['sessionId'] as LiveSessionId;
  const setSession = useStreamStore((s) => s.setSession);
  const [ready, setReady] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    // Use store's session if it matches — avoids redundant fetch on fresh navigation
    const storeSession = useStreamStore.getState().currentSession;
    if (storeSession?.id === sessionId) {
      if (TERMINAL_STATUSES.has(storeSession.status)) {
        router.replace('/dashboard');
        return;
      }
      setReady(true);
      return;
    }

    async function load(): Promise<void> {
      const res = await apiFetch(`${API_BASE}/sessions/${sessionId}`);
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const { data } = (await res.json()) as { data: LiveSession };
      if (TERMINAL_STATUSES.has(data.status)) {
        router.replace('/dashboard');
        return;
      }
      setSession(data);
      setReady(true);
    }

    void load();
  }, [sessionId, setSession, router]);

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-white">
        <p className="text-sm text-white/60">{t('errors.createFailed')}</p>
        <button
          type="button"
          onClick={() => router.replace('/dashboard')}
          className="rounded-xl border border-white/20 px-4 py-2 text-sm transition-colors hover:bg-white/10"
        >
          {tCommon('back')}
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return (
    <CreatorLayout>
      <FullscreenLiveView />
    </CreatorLayout>
  );
}
