'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE, apiFetch } from '@/lib/api';
import type { LiveSession } from '@tik-live-pro/shared-types';

export function useSessionHistory() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/sessions`);

      if (res.ok) {
        const json = (await res.json()) as { data: LiveSession[] };

        setSessions(
          json.data.filter(
            (s) => s.status === 'ended' || s.status === 'error' || s.status === 'ending',
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { sessions, loading, refresh: fetch };
}
