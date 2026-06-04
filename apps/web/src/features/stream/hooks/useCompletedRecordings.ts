'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE, apiFetch } from '@/lib/api';

export interface CompletedRecording {
  id: string;
  sessionId: string;
  fileName: string;
  publicUrl: string;
  sizeBytes: number;
  createdAt: string;
}

export function useCompletedRecordings(open: boolean) {
  const [items, setItems] = useState<CompletedRecording[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const sessionsRes = await apiFetch(`${API_BASE}/sessions`);
      if (!sessionsRes.ok) return;
      const sessionsData = (await sessionsRes.json()) as { data: Array<{ id: string }> };
      const sessionIds = sessionsData.data.map((s) => s.id);
      if (sessionIds.length === 0) {
        setItems([]);
        return;
      }

      const params = new URLSearchParams({ sessionIds: sessionIds.join(',') });
      const res = await apiFetch(
        `${API_BASE}/stream-orchestrator/recordings/completed?${params.toString()}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { items: CompletedRecording[] };
      setItems(data.items ?? []);
    } catch {
      // ignore transient errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  return { items, isLoading, refresh: load };
}
