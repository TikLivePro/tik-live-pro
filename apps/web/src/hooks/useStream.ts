'use client';

import { useState, useCallback } from 'react';
import { useStreamStore } from '@/store/stream.store';
import { useAuthStore } from '@/store/auth.store';
import type { LiveSessionId, SocialAccountId } from '@tik-live-pro/shared-types';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

export function useStream() {
  const [error, setError] = useState<string | null>(null);
  const { accessToken } = useAuthStore();
  const { currentSession, isStarting, isEnding, setSession, setStarting, setEnding, updateSessionStatus } =
    useStreamStore();

  const createSession = useCallback(
    async (params: { title: string; description?: string; destinationIds: SocialAccountId[] }) => {
      setError(null);
      setStarting(true);
      try {
        const res = await fetch(`${API_BASE}/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            title: params.title,
            description: params.description,
            destinationAccountIds: params.destinationIds,
          }),
        });
        if (!res.ok) throw new Error('Failed to create session');
        const { data } = await res.json() as { data: { sessionId: LiveSessionId } };
        return data.sessionId;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return null;
      } finally {
        setStarting(false);
      }
    },
    [accessToken, setStarting],
  );

  const startSession = useCallback(
    async (sessionId: LiveSessionId) => {
      setError(null);
      setStarting(true);
      try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}/start`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error('Failed to start session');
        updateSessionStatus('starting');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setStarting(false);
      }
    },
    [accessToken, setStarting, updateSessionStatus],
  );

  const endSession = useCallback(
    async (sessionId: LiveSessionId) => {
      setError(null);
      setEnding(true);
      try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}/end`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error('Failed to end session');
        updateSessionStatus('ending');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setEnding(false);
      }
    },
    [accessToken, setEnding, updateSessionStatus],
  );

  return {
    currentSession,
    isStarting,
    isEnding,
    error,
    createSession,
    startSession,
    endSession,
  };
}
