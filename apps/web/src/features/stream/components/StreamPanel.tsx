'use client';

import { useTranslations } from 'next-intl';
import { useStream } from '../hooks/useStream';
import { useStreamStore } from '../store/stream.store';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';

export function StreamPanel() {
  const t = useTranslations('stream');
  const { currentSession, isStarting, isEnding, startSession, endSession } = useStream();
  const isLive = useStreamStore((s) => s.currentSession?.status === 'live');

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('title')}</h2>
        {currentSession && <StatusBadge status={currentSession.status} />}
      </div>

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
                  dest.status === 'live'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {dest.platform}
                {dest.status === 'live' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
