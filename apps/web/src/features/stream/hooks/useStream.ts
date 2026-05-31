'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useStreamStore } from '../store/stream.store';
import { API_BASE, apiFetch } from '@/lib/api';
import type { LiveSession, LiveSessionId, SocialAccountId } from '@tik-live-pro/shared-types';

function extractApiError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    // Custom error envelope: { error: { message } }
    if (b['error'] && typeof b['error'] === 'object') {
      const msg = (b['error'] as Record<string, unknown>)['message'];
      if (typeof msg === 'string' && msg) return msg;
    }
    // Fastify validation error: { message }
    if (typeof b['message'] === 'string' && b['message']) return b['message'];
  }
  return fallback;
}

export function useStream() {
  const t = useTranslations('stream');
  const router = useRouter();
  const { currentSession, isStarting, isEnding, isPausing, setSession, setStarting, setEnding, setPausing, updateSessionStatus } =
    useStreamStore();

  const createSession = useCallback(
    async (params: { title: string; description?: string; destinationIds: SocialAccountId[] }) => {
      setStarting(true);
      try {
        const res = await apiFetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: params.title,
            description: params.description,
            destinationAccountIds: params.destinationIds,
          }),
        });
        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null);
          toast.error(extractApiError(body, t('errors.createFailed')));
          return null;
        }
        const { data } = (await res.json()) as { data: { sessionId: LiveSessionId } };
        return data.sessionId;
      } catch {
        toast.error(t('errors.createFailed'));
        return null;
      } finally {
        setStarting(false);
      }
    },
    [setStarting, t],
  );

  const startSession = useCallback(
    async (sessionId: LiveSessionId) => {
      setStarting(true);
      try {
        const res = await apiFetch(`${API_BASE}/sessions/${sessionId}/start`, { method: 'POST' });
        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null);
          toast.error(extractApiError(body, t('errors.startFailed')));
          return;
        }
        updateSessionStatus('starting');
        toast.success(t('sessionStarted'));
      } catch {
        toast.error(t('errors.startFailed'));
      } finally {
        setStarting(false);
      }
    },
    [setStarting, updateSessionStatus, t],
  );

  const endSession = useCallback(
    async (sessionId: LiveSessionId) => {
      setEnding(true);
      try {
        const res = await apiFetch(`${API_BASE}/sessions/${sessionId}/end`, { method: 'POST' });
        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null);
          toast.error(extractApiError(body, t('errors.endFailed')));
          return;
        }
        setSession(null);
        toast.success(t('sessionEnded'));
        router.push('/dashboard');
      } catch {
        toast.error(t('errors.endFailed'));
      } finally {
        setEnding(false);
      }
    },
    [setEnding, setSession, router, t],
  );

  const goLive = useCallback(
    async (params: { title: string; description?: string; destinationIds: SocialAccountId[] }) => {
      setStarting(true);
      try {
        const createRes = await apiFetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: params.title,
            description: params.description,
            destinationAccountIds: params.destinationIds,
          }),
        });
        if (!createRes.ok) {
          const body: unknown = await createRes.json().catch(() => null);
          toast.error(extractApiError(body, t('errors.createFailed')));
          return;
        }
        const { data: createData } = (await createRes.json()) as { data: { sessionId: LiveSessionId } };
        const sessionId = createData.sessionId;

        const sessionRes = await apiFetch(`${API_BASE}/sessions/${sessionId}`);
        if (sessionRes.ok) {
          const { data: sessionData } = (await sessionRes.json()) as { data: LiveSession };
          setSession(sessionData);
        }

        const startRes = await apiFetch(`${API_BASE}/sessions/${sessionId}/start`, { method: 'POST' });
        if (!startRes.ok) {
          const body: unknown = await startRes.json().catch(() => null);
          toast.error(extractApiError(body, t('errors.startFailed')));
          return;
        }
        updateSessionStatus('starting');
        toast.success(t('sessionStarted'));
        router.push(`/live/${sessionId}`);
      } catch {
        toast.error(t('errors.createFailed'));
      } finally {
        setStarting(false);
      }
    },
    [setStarting, setSession, updateSessionStatus, router, t],
  );

  const pauseSession = useCallback(
    async (sessionId: LiveSessionId) => {
      setPausing(true);
      try {
        const res = await apiFetch(`${API_BASE}/sessions/${sessionId}/pause`, { method: 'POST' });
        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null);
          toast.error(extractApiError(body, t('errors.pauseFailed')));
          return;
        }
        updateSessionStatus('paused');
        toast.success(t('sessionPaused'));
      } catch {
        toast.error(t('errors.pauseFailed'));
      } finally {
        setPausing(false);
      }
    },
    [setPausing, updateSessionStatus, t],
  );

  const resumeSession = useCallback(
    async (sessionId: LiveSessionId) => {
      setPausing(true);
      try {
        const res = await apiFetch(`${API_BASE}/sessions/${sessionId}/resume`, { method: 'POST' });
        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null);
          toast.error(extractApiError(body, t('errors.resumeFailed')));
          return;
        }
        updateSessionStatus('live');
        toast.success(t('sessionResumed'));
      } catch {
        toast.error(t('errors.resumeFailed'));
      } finally {
        setPausing(false);
      }
    },
    [setPausing, updateSessionStatus, t],
  );

  return {
    currentSession,
    isStarting,
    isEnding,
    isPausing,
    createSession,
    startSession,
    endSession,
    pauseSession,
    resumeSession,
    goLive,
    setSession,
  };
}
