'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useStreamStore } from '../store/stream.store';
import { API_BASE, apiFetch } from '@/lib/api';
import type { LiveSession, LiveSessionId, SocialAccountId } from '@tik-live-pro/shared-types';

export function useStream() {
  const t = useTranslations('stream');
  const { currentSession, isStarting, isEnding, setSession, setStarting, setEnding, updateSessionStatus } =
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
        if (!res.ok) throw new Error('Failed to create session');
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
        const res = await apiFetch(`${API_BASE}/sessions/${sessionId}/start`, {
          method: 'POST',
        });
        if (!res.ok) throw new Error('Failed to start session');
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
        const res = await apiFetch(`${API_BASE}/sessions/${sessionId}/end`, {
          method: 'POST',
        });
        if (!res.ok) throw new Error('Failed to end session');
        updateSessionStatus('ending');
        toast.success(t('sessionEnded'));
      } catch {
        toast.error(t('errors.endFailed'));
      } finally {
        setEnding(false);
      }
    },
    [setEnding, updateSessionStatus, t],
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
          toast.error(t('errors.createFailed'));
          return;
        }
        const { data: createData } = (await createRes.json()) as { data: { sessionId: LiveSessionId } };
        const sessionId = createData.sessionId;

        // Load the full session into the store so subsequent status updates work
        const sessionRes = await apiFetch(`${API_BASE}/sessions/${sessionId}`);
        if (sessionRes.ok) {
          const { data: sessionData } = (await sessionRes.json()) as { data: LiveSession };
          setSession(sessionData);
        }

        const startRes = await apiFetch(`${API_BASE}/sessions/${sessionId}/start`, { method: 'POST' });
        if (!startRes.ok) {
          toast.error(t('errors.startFailed'));
          return;
        }
        updateSessionStatus('starting');
        toast.success(t('sessionStarted'));
      } catch {
        toast.error(t('errors.createFailed'));
      } finally {
        setStarting(false);
      }
    },
    [setStarting, setSession, updateSessionStatus, t],
  );

  return {
    currentSession,
    isStarting,
    isEnding,
    createSession,
    startSession,
    endSession,
    goLive,
    setSession,
  };
}
