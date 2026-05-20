'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useStream } from '@/hooks/useStream';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import type { SocialAccount } from '@tik-live-pro/shared-types';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

const AVATAR_COLORS = [
  'bg-purple-500',
  'bg-orange-400',
  'bg-teal-500',
  'bg-blue-500',
  'bg-pink-500',
  'bg-indigo-500',
];

function useElapsedTime(startedAt: Date | null): string {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const origin = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - origin) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
  const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function useSocialAccounts() {
  const { accessToken } = useAuthStore();
  return useQuery<SocialAccount[]>({
    queryKey: ['social-accounts'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/integrations/accounts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to load accounts');
      const { data } = (await res.json()) as { data: SocialAccount[] };
      return data;
    },
    enabled: !!accessToken,
  });
}

export function LiveDashboard(): React.ReactElement {
  const t = useTranslations('stream');
  const { currentSession, isEnding, endSession } = useStream();
  const { data: socialAccounts } = useSocialAccounts();
  const isLive = currentSession?.status === 'live';
  const elapsed = useElapsedTime(isLive ? (currentSession?.startedAt ?? null) : null);

  const destinations = currentSession?.destinations ?? [];
  const liveCount = destinations.filter((d) => d.status === 'live').length;

  function getAccount(socialAccountId: string): SocialAccount | undefined {
    return socialAccounts?.find((a) => a.id === socialAccountId);
  }

  function getInitials(name: string): string {
    return name
      .replace(/^@/, '')
      .split(/[\s_]/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0f1117] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/5">
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
          <span className="font-bold text-base sm:text-lg tracking-tight">TikLive Pro</span>
        </div>

        {isLive && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            {t('status.live')}
          </span>
        )}
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5 sm:max-w-2xl sm:px-6 lg:max-w-3xl">
        {/* Stats card */}
        <div className="flex items-center justify-between rounded-2xl bg-white/5 px-5 py-4 sm:px-6 sm:py-5">
          <div>
            <p className="text-xs text-slate-400">{t('liveDuration')}</p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">
              {elapsed}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">{t('liveAccounts')}</p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-green-400 sm:text-4xl">
              {liveCount}&nbsp;/&nbsp;{destinations.length}
            </p>
          </div>
        </div>

        {/* Account status */}
        {destinations.length > 0 && (
          <section className="space-y-2.5">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              {t('accountStatus')}
            </p>

            <div className="space-y-2">
              {destinations.map((dest, i) => {
                const account = getAccount(dest.socialAccountId);
                const displayName = account?.displayName ?? dest.platform;
                const isDestLive = dest.status === 'live';
                const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length] ?? 'bg-slate-600';

                return (
                  <div
                    key={dest.socialAccountId}
                    className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3"
                  >
                    <span
                      className={cn(
                        'h-2 w-2 flex-shrink-0 rounded-full',
                        isDestLive ? 'bg-green-500' : 'bg-slate-500',
                      )}
                    />
                    <div
                      className={cn(
                        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                        avatarColor,
                      )}
                    >
                      {getInitials(displayName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{displayName}</p>
                      <p className="text-xs text-slate-400">{t('streamActive')}</p>
                    </div>
                    {isDestLive && (
                      <span className="text-xs font-bold text-green-400">{t('ok')}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Stop button */}
      {isLive && currentSession && (
        <div className="mx-auto w-full max-w-lg px-4 pb-6 sm:max-w-2xl sm:px-6 lg:max-w-3xl">
          <button
            onClick={() => void endSession(currentSession.id)}
            disabled={isEnding}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="h-4 w-4 flex-shrink-0 rounded-sm border-2 border-current" />
            {isEnding ? t('status.ending') : t('stopLive')}
          </button>
        </div>
      )}
    </div>
  );
}
