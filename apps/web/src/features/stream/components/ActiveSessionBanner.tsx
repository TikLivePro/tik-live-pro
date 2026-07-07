'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useStreamStore } from '../store/stream.store';
import { useStream } from '../hooks/useStream';

const INACTIVE_STATUSES = new Set(['ending', 'ended', 'error']);
const STOPPABLE_STATUSES = new Set(['live', 'starting', 'paused']);

export function ActiveSessionBanner(): React.ReactElement | null {
  const t = useTranslations('stream');
  const currentSession = useStreamStore((s) => s.currentSession);
  const { endSession, pauseSession, resumeSession, isEnding, isPausing } = useStream();

  const hasActiveSession = currentSession !== null && !INACTIVE_STATUSES.has(currentSession.status);
  if (!hasActiveSession) return null;

  const canStop = STOPPABLE_STATUSES.has(currentSession.status);
  const canPause = currentSession.status === 'live';
  const canResume = currentSession.status === 'paused';

  return (
    <div className="sticky top-14 z-30 border-b border-red-500/20 bg-gradient-to-r from-red-500/15 via-red-500/10 to-orange-500/10 px-4 py-2.5 backdrop-blur-md">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 flex-shrink-0 rounded-full ${canResume ? 'bg-yellow-400' : 'animate-pulse bg-red-500'}`}
          />
          <span className="truncate text-sm font-semibold text-red-600 dark:text-red-400">
            {currentSession.title}
          </span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {canPause && (
            <button
              type="button"
              onClick={() => void pauseSession(currentSession.id)}
              disabled={isPausing}
              className="btn-ghost flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-foreground/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                className="h-3 w-3 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              {isPausing ? t('status.paused') : t('pauseLive')}
            </button>
          )}
          {canResume && (
            <button
              type="button"
              onClick={() => void resumeSession(currentSession.id)}
              disabled={isPausing}
              className="flex items-center gap-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-600 transition-colors hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-yellow-300"
            >
              <svg
                className="h-3 w-3 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <polygon points="5,3 19,12 5,21" />
              </svg>
              {t('resumeLive')}
            </button>
          )}
          {canStop && (
            <button
              type="button"
              onClick={() => void endSession(currentSession.id)}
              disabled={isEnding}
              className="btn-ghost flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-foreground/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="h-2 w-2 flex-shrink-0 rounded-[2px] border border-current" />
              {isEnding ? t('status.ending') : t('stopLive')}
            </button>
          )}
          <Link
            href={`/live/${currentSession.id}`}
            className="btn-gradient px-3 py-1 text-xs font-semibold"
          >
            {t('returnToLive')}
          </Link>
        </div>
      </div>
    </div>
  );
}
