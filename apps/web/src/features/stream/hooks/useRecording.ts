'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { API_BASE, apiFetch } from '@/lib/api';
import type { LiveSessionId } from '@tik-live-pro/shared-types';

export function useRecording(sessionId: LiveSessionId | null) {
  const t = useTranslations('stream');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    void (async () => {
      try {
        const res = await apiFetch(`${API_BASE}/stream-orchestrator/sessions/${sessionId}/recording/status`);
        if (!res.ok) return;
        const data = (await res.json()) as { status: 'none' | 'recording' | 'paused' | 'stopped' };
        setIsRecording(data.status === 'recording');
        setIsPaused(data.status === 'paused');
      } catch {
        // ignore — leave state as false
      }
    })();
  }, [sessionId]);

  const startRecording = useCallback(
    async (sid: LiveSessionId): Promise<void> => {
      setIsToggling(true);
      try {
        const res = await apiFetch(
          `${API_BASE}/stream-orchestrator/sessions/${sid}/recording/start`,
          { method: 'POST' },
        );
        if (!res.ok) {
          toast.error(t('recording.startFailed'));
          return;
        }
        setIsRecording(true);
        setIsPaused(false);
        toast.success(t('recording.started'));
      } catch {
        toast.error(t('recording.startFailed'));
      } finally {
        setIsToggling(false);
      }
    },
    [t],
  );

  const stopRecording = useCallback(
    async (sid: LiveSessionId): Promise<void> => {
      setIsToggling(true);
      try {
        const res = await apiFetch(
          `${API_BASE}/stream-orchestrator/sessions/${sid}/recording/stop`,
          { method: 'POST' },
        );
        if (!res.ok) {
          toast.error(t('recording.stopFailed'));
          return;
        }
        setIsRecording(false);
        setIsPaused(false);
        toast.success(t('recording.stopped'));
      } catch {
        toast.error(t('recording.stopFailed'));
      } finally {
        setIsToggling(false);
      }
    },
    [t],
  );

  const pauseRecording = useCallback(
    async (sid: LiveSessionId): Promise<void> => {
      setIsToggling(true);
      try {
        const res = await apiFetch(
          `${API_BASE}/stream-orchestrator/sessions/${sid}/recording/pause`,
          { method: 'POST' },
        );
        if (!res.ok) {
          toast.error(t('recording.pauseFailed'));
          return;
        }
        setIsRecording(false);
        setIsPaused(true);
        toast.success(t('recording.paused'));
      } catch {
        toast.error(t('recording.pauseFailed'));
      } finally {
        setIsToggling(false);
      }
    },
    [t],
  );

  const resumeRecording = useCallback(
    async (sid: LiveSessionId): Promise<void> => {
      setIsToggling(true);
      try {
        const res = await apiFetch(
          `${API_BASE}/stream-orchestrator/sessions/${sid}/recording/resume`,
          { method: 'POST' },
        );
        if (!res.ok) {
          toast.error(t('recording.resumeFailed'));
          return;
        }
        setIsRecording(true);
        setIsPaused(false);
        toast.success(t('recording.resumed'));
      } catch {
        toast.error(t('recording.resumeFailed'));
      } finally {
        setIsToggling(false);
      }
    },
    [t],
  );

  const toggle = useCallback(
    async (sid: LiveSessionId): Promise<void> => {
      if (isToggling) return;
      if (isRecording || isPaused) {
        await stopRecording(sid);
      } else {
        await startRecording(sid);
      }
    },
    [isRecording, isPaused, isToggling, startRecording, stopRecording],
  );

  return { isRecording, isPaused, isToggling, toggle, pauseRecording, resumeRecording };
}
