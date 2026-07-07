'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { DestinationHealthDots } from './DestinationHealthDots';
import { useSidebar } from '@/components/SidebarContext';
import type { PlatformStreamDestination } from '@tik-live-pro/shared-types';

interface Props {
  isLive: boolean;
  isStarting: boolean;
  isPaused: boolean;
  elapsed: string;
  destinations: readonly PlatformStreamDestination[];
  viewerCount: number;
  isEnding: boolean;
  isPausing: boolean;
  shareCopied: boolean;
  onGoHome: () => void;
  onPauseResume: () => void;
  onShare: () => void;
  onViewersClick: () => void;
  onEndClick: () => void;
  title?: string | undefined;
  description?: string | undefined;
  isMicMuted?: boolean | undefined;
  isCameraOff?: boolean | undefined;
  isVideoSharing?: boolean | undefined;
}

/**
 * Control-room top status bar: sidebar toggle, stream title, status capsules,
 * elapsed timer, health dots, viewer count, and the End-stream action.
 */
export function LiveStatusBar({
  isLive,
  isStarting,
  isPaused,
  elapsed,
  destinations,
  viewerCount,
  isEnding,
  isPausing,
  shareCopied,
  onGoHome,
  onPauseResume,
  onShare,
  onViewersClick,
  onEndClick,
  title,
  description,
  isMicMuted = false,
  isCameraOff = false,
  isVideoSharing = false,
}: Props): React.ReactElement {
  const t = useTranslations('stream');
  const { toggleCollapse, toggleOpen } = useSidebar();

  return (
    <header className="glass-header sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--card-border-color)] px-3 sm:gap-3 sm:px-4">
      {/* Sidebar Toggle Button */}
      <button
        type="button"
        onClick={() => {
          if (window.innerWidth >= 1024) {
            toggleCollapse();
          } else {
            toggleOpen();
          }
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Toggle sidebar"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      </button>

      {/* Home + wordmark (visible only when sidebar is hidden on smaller screens) */}
      <button
        type="button"
        onClick={onGoHome}
        aria-label={t('goHome')}
        className="btn-ghost flex h-8 w-8 shrink-0 items-center justify-center lg:hidden"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </button>
      <span className="text-gradient-brand hidden text-base font-bold tracking-tight md:inline lg:hidden">
        TikLivePro
      </span>

      {/* Status pill + timer */}
      <div className="flex items-center gap-2 shrink-0">
        {isStarting && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-500">
            <span className="h-1.5 w-1.5 animate-spin rounded-full border border-current border-t-transparent" />
            {t('status.starting')}
          </span>
        )}
        {isLive && (
          <span className="badge-live px-3 py-1 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            {t('status.live')}
          </span>
        )}
        {isPaused && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-500">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {t('status.paused')}
          </span>
        )}
        <span className="rounded-full border border-[var(--card-border-color)] bg-surface-2 px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-foreground">
          {elapsed}
        </span>
      </div>

      {/* Vertical divider */}
      <div className="hidden h-5 w-px bg-white/10 sm:block shrink-0" />

      {/* Stream Info (Title & Description) */}
      <div className="hidden min-w-0 flex-1 flex-col md:flex">
        <span className="truncate text-sm font-bold text-foreground leading-tight">
          {title || t('status.live')}
        </span>
        {description && (
          <span className="truncate text-[10px] font-medium text-muted-foreground leading-none mt-0.5">
            {description}
          </span>
        )}
      </div>

      {/* Live Status Indicators (Microphone, Audio Monitoring, Video Source status) */}
      <div className="hidden items-center gap-1.5 lg:flex shrink-0">
        {/* Music/Mic indicator */}
        <div className="flex items-center gap-1.5 rounded-full border border-white/5 bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <span className={cn('h-1.5 w-1.5 rounded-full shadow-[0_0_4px_currentColor]', isMicMuted ? 'bg-red-500 text-red-500/85' : 'bg-emerald-400 text-emerald-400/85')} />
        </div>

        {/* Headphones/Monitoring indicator */}
        <div className="flex items-center gap-1.5 rounded-full border border-white/5 bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          </svg>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 text-emerald-400/85 shadow-[0_0_4px_currentColor]" />
        </div>

        {/* Streaming/Video sharing indicator */}
        <div className="flex items-center gap-1.5 rounded-full border border-white/5 bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          <span className={cn('h-1.5 w-1.5 rounded-full shadow-[0_0_4px_currentColor]', isCameraOff ? 'bg-red-500 text-red-500/85' : isVideoSharing ? 'bg-amber-400 text-amber-400/85' : 'bg-emerald-400 text-emerald-400/85')} />
        </div>
      </div>

      <DestinationHealthDots destinations={destinations} className="hidden md:flex shrink-0" />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Viewer count */}
        <button
          type="button"
          onClick={onViewersClick}
          aria-label={t('controlRoom.viewersTab')}
          className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold tabular-nums text-muted-foreground hover:text-foreground"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {viewerCount}
        </button>

        {/* Share */}
        <button
          type="button"
          onClick={onShare}
          aria-label={t('share.button')}
          className={cn(
            'btn-ghost hidden h-8 w-8 items-center justify-center sm:flex',
            shareCopied && 'text-emerald-500',
          )}
        >
          {shareCopied ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          )}
        </button>

        {/* Pause / resume */}
        {(isLive || isPaused) && (
          <button
            type="button"
            onClick={onPauseResume}
            disabled={isPausing || isEnding}
            aria-label={isPaused ? t('resumeLive') : t('pauseLive')}
            className={cn(
              'btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50',
              isPaused && 'text-yellow-500',
            )}
          >
            {isPaused ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            )}
            <span className="hidden lg:inline">{isPaused ? t('resumeLive') : t('pauseLive')}</span>
          </button>
        )}

        {/* End stream — desktop; mobile uses the sticky bottom bar */}
        <button
          type="button"
          onClick={onEndClick}
          disabled={isEnding}
          className="hidden items-center gap-2 rounded-full border border-red-500/30 bg-red-600/10 px-4 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 lg:inline-flex"
        >
          <span className="h-2.5 w-2.5 rounded-[2px] border-2 border-current" />
          {isEnding ? t('status.ending') : t('stopLive')}
        </button>
      </div>
    </header>
  );
}
