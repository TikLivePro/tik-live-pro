'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useStreamStore } from '../store/stream.store';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { useStream } from '../hooks/useStream';
import { MinimizedPlayer } from './MinimizedPlayer';

export function PersistentMinimizedPlayer(): React.ReactElement | null {
  const router = useRouter();
  const pathname = usePathname();
  const isMinimized = useStreamStore((s) => s.isMinimized);
  const currentSession = useStreamStore((s) => s.currentSession);
  const activeStream = useStreamStore((s) => s.activeStream);
  const setMinimized = useStreamStore((s) => s.setMinimized);
  const { pauseSession, resumeSession, isPausing } = useStream();

  const isPaused = currentSession?.status === 'paused';

  const elapsed = useElapsedTime(
    currentSession?.status === 'live' ? (currentSession.startedAt ?? null) : null,
  );

  // Only show on non-live pages — the live page renders its own mini player
  if (!isMinimized || !currentSession || !activeStream?.active || pathname.startsWith('/live/')) {
    return null;
  }

  function handleRestore(): void {
    setMinimized(false);
    router.push(`/live/${currentSession!.id}`);
  }

  function handleGoHome(): void {
    router.push('/dashboard');
  }

  const extraProps =
    pathname === '/dashboard' ? {} : { onGoHome: handleGoHome };

  return (
    <MinimizedPlayer
      stream={activeStream}
      elapsed={elapsed}
      isPaused={isPaused}
      isPausing={isPausing}
      onPause={() => void pauseSession(currentSession.id)}
      onResume={() => void resumeSession(currentSession.id)}
      onRestore={handleRestore}
      {...extraProps}
    />
  );
}
