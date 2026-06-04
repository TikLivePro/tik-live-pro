'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE, apiFetch } from '@/lib/api';

export interface RecordingSegment {
  startedAt: string;
}

export interface ActiveRecording {
  ingestKey: string;
  sessionId: string | null;
  title: string | null;
  segments: RecordingSegment[];
  status: 'recording' | 'paused';
}

export function useRecordingsList(open: boolean) {
  const [items, setItems] = useState<ActiveRecording[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetch_ = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/stream-orchestrator/recordings`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: ActiveRecording[] };
      setItems(data.items ?? []);
    } catch {
      // ignore transient errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void fetch_();
    const id = setInterval(() => void fetch_(), 10_000);
    return () => clearInterval(id);
  }, [open, fetch_]);

  return { items, isLoading, refresh: fetch_ };
}
