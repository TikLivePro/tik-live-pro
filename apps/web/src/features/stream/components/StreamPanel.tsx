'use client';

import { useTranslations } from 'next-intl';
import { useStream } from '@/hooks/useStream';
import { useStreamStore } from '@/store/stream.store';
import { cn } from '@/lib/utils';

export function StreamPanel() {
  const t = useTranslations('stream');
  const { currentSession, isStarting, isEnding, error, startSession, endSession } = useStream();
  const isLive = currentSession?.status === 'live';

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('title')}</h2>
        {currentSession && (
          <StatusBadge status={currentSession.status} />
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
      )}

      <div className="flex gap-3">
        {!isLive && currentSession && (
          <button
            onClick={() => void startSession(currentSession.id)}
            disabled={isStarting}
            className={cn(
              'flex-1 py-3 px-6 rounded-lg font-semibold text-white transition-colors',
              'bg-brand hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isStarting ? t('status.starting') : t('goLive')}
          </button>
        )}
        {isLive && currentSession && (
          <button
            onClick={() => void endSession(currentSession.id)}
            disabled={isEnding}
            className={cn(
              'flex-1 py-3 px-6 rounded-lg font-semibold text-white transition-colors',
              'bg-destructive hover:bg-destructive/90 disabled:opacity-50',
            )}
          >
            {isEnding ? t('status.ending') : t('endStream')}
          </button>
        )}
      </div>

      {currentSession && currentSession.destinations.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{t('destinations')}</p>
          <div className="flex flex-wrap gap-2">
            {currentSession.destinations.map((dest) => (
              <span
                key={dest.socialAccountId}
                className={cn(
                  'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium',
                  dest.status === 'live' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-muted text-muted-foreground',
                )}
              >
                {dest.platform}
                {dest.status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('stream.status');
  const isLive = status === 'live';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full',
        isLive
          ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {isLive && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
      {t(status as Parameters<typeof t>[0])}
    </span>
  );
}
