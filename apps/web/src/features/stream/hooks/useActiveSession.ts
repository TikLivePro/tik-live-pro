'use client';

import { useEffect } from 'react';
import { API_BASE, apiFetch } from '@/lib/api';
import { useStreamStore } from '../store/stream.store';
import type { LiveSession } from '@tik-live-pro/shared-types';

const INACTIVE_STATUSES = new Set(['ending', 'ended', 'error']);

/**
 * Hydrates the stream store with the user's active session on mount.
 * Needed because the Zustand store is in-memory only — a page refresh clears it
 * even when a session is still active in the backend.
 */
export function useActiveSession(): void {
  const { currentSession, setSession } = useStreamStore();

  useEffect(() => {
    if (currentSession !== null && !INACTIVE_STATUSES.has(currentSession.status)) return;

    void (async () => {
      try {
        const res = await apiFetch(`${API_BASE}/sessions`);
        if (!res.ok) return;
        const { data } = (await res.json()) as { data: LiveSession[] };
        const active = data.find((s) => !INACTIVE_STATUSES.has(s.status)) ?? null;
        setSession(active);
      } catch {
        // silently ignore — user just won't see the banner
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
