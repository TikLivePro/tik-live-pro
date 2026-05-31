'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { StreamPanel } from '@/features/stream/components/StreamPanel';
import { CommentFeed } from '@/features/comments/components/CommentFeed';
import { AccountList } from '@/features/accounts/components/AccountList';
import { HistorySidebar } from '@/features/stream/components/HistorySidebar';
import { UserMenu } from '@/features/auth/components/UserMenu';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useStreamStore, useActiveSession } from '@/features/stream';
import { useStream } from '@/features/stream/hooks/useStream';

const INACTIVE_STATUSES = new Set(['ending', 'ended', 'error']);
const STOPPABLE_STATUSES = new Set(['live', 'starting', 'paused']);

export default function DashboardPage(): React.ReactElement {
  const t = useTranslations('stream');
  const [historyOpen, setHistoryOpen] = useState(false);
  useActiveSession();
  const currentSession = useStreamStore((s) => s.currentSession);
  const { endSession, pauseSession, resumeSession, isEnding, isPausing } = useStream();
  const hasActiveSession = currentSession !== null && !INACTIVE_STATUSES.has(currentSession.status);
  const canStop = currentSession !== null && STOPPABLE_STATUSES.has(currentSession.status);
  const canPause = currentSession?.status === 'live';
  const canResume = currentSession?.status === 'paused';

  console.log('currentSession :>> ', currentSession);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9.5" />
                <circle cx="12" cy="12" r="3.5" />
              </svg>
            </span>
            <span className="text-base font-bold tracking-tight sm:text-lg">TikLive Pro</span>
          </div>
          <div className="flex items-center gap-2">
            {/* History toggle */}
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-label={t('history.sectionLabel')}
              title={t('history.sectionLabel')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
            <NotificationBell />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Return-to-live banner */}
      {hasActiveSession && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2.5">
          <div className="container mx-auto flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2 w-2 flex-shrink-0 rounded-full ${canResume ? 'bg-yellow-400' : 'animate-pulse bg-red-500'}`}
              />
              <span className="truncate text-sm font-medium text-red-400">
                {currentSession.title}
              </span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {canPause && (
                <button
                  type="button"
                  onClick={() => void pauseSession(currentSession.id)}
                  disabled={isPausing}
                  className="flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="flex items-center gap-1.5 rounded-lg border border-yellow-400/40 px-3 py-1 text-xs font-semibold text-yellow-300 transition-colors hover:bg-yellow-400/10 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="flex items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-[2px] border border-current" />
                  {isEnding ? t('status.ending') : t('stopLive')}
                </button>
              )}
              <Link
                href={`/live/${currentSession.id}`}
                className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-500"
              >
                {t('returnToLive')}
              </Link>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <StreamPanel />
            <AccountList />
          </div>
          <div className="lg:col-span-1">
            <CommentFeed />
          </div>
        </div>
      </main>

      <HistorySidebar open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
