import { useMemo } from 'react';
import { useSessionHistory } from './useSessionHistory';
import { useViewerPeaks } from './useViewerPeaks';

interface MonthlyStats {
  totalStreams: number;
  hoursLive: number;
  /** Highest concurrent viewer count across this month's sessions. */
  peakViewers: number;
  loading: boolean;
}

export function useMonthlyStats(): MonthlyStats {
  const { sessions, loading } = useSessionHistory();

  const monthSessions = useMemo(() => {
    const now = new Date();
    return sessions.filter((s) => {
      const createdAt = new Date(s.createdAt);
      return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
    });
  }, [sessions]);

  const peaks = useViewerPeaks(useMemo(() => monthSessions.map((s) => s.id), [monthSessions]));

  return useMemo(() => {
    const totalMs = monthSessions.reduce((sum, s) => {
      if (!s.startedAt || !s.endedAt) return sum;
      const ms = new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime();
      return ms > 0 ? sum + ms : sum;
    }, 0);

    const peakViewers = monthSessions.reduce((max, s) => Math.max(max, peaks[s.id] ?? 0), 0);

    return {
      totalStreams: monthSessions.length,
      hoursLive: Math.round((totalMs / 3600000) * 10) / 10,
      peakViewers,
      loading,
    };
  }, [monthSessions, peaks, loading]);
}
