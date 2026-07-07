'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';

// GET /comments/viewer-stats accepts at most 50 session IDs per call.
const MAX_IDS_PER_REQUEST = 50;

/**
 * Peak concurrent viewer count per session, from the comments service
 * (`GET /comments/viewer-stats` — public read). Sessions with no recorded
 * peak are absent from the map.
 */
export function useViewerPeaks(sessionIds: readonly string[]): Record<string, number> {
  const [peaks, setPeaks] = useState<Record<string, number>>({});
  // Stable key so the effect only refires when the id set actually changes
  const idsKey = [...sessionIds].sort().join(',');

  useEffect(() => {
    if (!idsKey) return;
    const controller = new AbortController();
    const ids = idsKey.split(',');

    void (async () => {
      try {
        const merged: Record<string, number> = {};
        for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
          const batch = ids.slice(i, i + MAX_IDS_PER_REQUEST);
          const res = await fetch(
            `${API_BASE}/comments/viewer-stats?sessionIds=${batch.join(',')}`,
            { signal: controller.signal },
          );
          if (!res.ok) return;
          const { data } = (await res.json()) as {
            data: { peaks: { sessionId: string; peakViewers: number }[] };
          };
          for (const p of data.peaks) merged[p.sessionId] = p.peakViewers;
        }
        setPeaks(merged);
      } catch {
        // Peaks are decorative — leave the map empty on failure.
      }
    })();

    return () => controller.abort();
  }, [idsKey]);

  return peaks;
}
