'use client';

import { useTranslations } from 'next-intl';
import { useStream } from '../hooks/useStream';
import { useElapsedTime } from '../hooks/useElapsedTime';
import { useSocialAccounts } from '@/features/accounts/hooks/useSocialAccounts';
import { UserMenu } from '@/features/auth/components/UserMenu';
import { StatsCard } from './StatsCard';
import { CameraPreview } from './CameraPreview';
import { ShareLivePanel } from './ShareLivePanel';
import { AVATAR_COLORS } from '../consts/stream.consts';
import { getInitials } from '@/lib/text.utils';
import { cn } from '@/lib/utils';

export function LiveDashboard(): React.ReactElement {
  const t = useTranslations('stream');
  const { currentSession, isEnding, endSession } = useStream();
  const { data: socialAccounts } = useSocialAccounts();

  const isLive = currentSession?.status === 'live';
  const elapsed = useElapsedTime(isLive ? (currentSession?.startedAt ?? null) : null);
  const destinations = currentSession?.destinations ?? [];
  const liveCount = destinations.filter((d) => d.status === 'live').length;

  function getAccount(socialAccountId: string) {
    return socialAccounts?.find((a) => a.id === socialAccountId);
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0f1117] text-white">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="TikLive Pro" className="h-7 w-7 object-contain" />
          <span className="text-base font-bold tracking-tight sm:text-lg">TikLive Pro</span>
        </div>
        <div className="flex items-center gap-3">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {t('status.live')}
            </span>
          )}
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5 sm:max-w-2xl sm:px-6 lg:max-w-3xl">
        {/* Camera feed — auto-starts when dashboard mounts */}
        <CameraPreview autoStart className="w-full" />

        <StatsCard elapsed={elapsed} liveCount={liveCount} totalCount={destinations.length} />

        {/* Share link */}
        {currentSession && (
          <ShareLivePanel sessionId={currentSession.id} />
        )}

        {/* Per-account live status */}
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
                    <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', isDestLive ? 'bg-green-500' : 'bg-slate-500')} />
                    <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white', avatarColor)}>
                      {getInitials(displayName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{displayName}</p>
                      <p className="text-xs text-slate-400">{t('streamActive')}</p>
                    </div>
                    {isDestLive && <span className="text-xs font-bold text-green-400">{t('ok')}</span>}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

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
