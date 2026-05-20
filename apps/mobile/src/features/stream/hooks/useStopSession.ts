import { useStreamStore } from '@/store/stream.store';
import { useAuthStore } from '@/store/auth.store';
import { API_BASE } from '@/lib/api';
import type { LiveSessionId } from '@tik-live-pro/shared-types';

export function useStopSession() {
  const { isEnding, setEnding, updateSessionStatus } = useStreamStore();
  const { accessToken } = useAuthStore();

  async function stopSession(sessionId: LiveSessionId): Promise<void> {
    if (isEnding) return;
    setEnding(true);
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (res.ok) updateSessionStatus('ending');
    } finally {
      setEnding(false);
    }
  }

  return { isEnding, stopSession };
}
