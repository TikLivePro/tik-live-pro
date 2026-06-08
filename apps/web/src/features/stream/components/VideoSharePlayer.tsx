'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface Props {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  allowViewerControl: boolean;
  isVideoLoaded: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onSetSpeed: (rate: number) => void;
  onToggleViewerControl: (allow: boolean) => void;
}

const SPEEDS = [0.5, 1, 1.5, 2] as const;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoSharePlayer({
  isPlaying,
  currentTime,
  duration,
  allowViewerControl,
  isVideoLoaded,
  onPlay,
  onPause,
  onSeek,
  onSetSpeed,
  onToggleViewerControl,
}: Props): React.ReactElement {
  const t = useTranslations('stream');
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex flex-col gap-2">
      {isVideoLoaded && (
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          {/* Seek bar */}
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label={t('videoShare.seek')}
            className="h-1 w-full cursor-pointer accent-brand"
          />

          {/* Time */}
          <div className="flex items-center justify-between text-[10px] tabular-nums text-white/40">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2">
            {/* Play / Pause */}
            <button
              type="button"
              onClick={isPlaying ? onPause : onPlay}
              aria-label={isPlaying ? t('videoShare.pause') : t('videoShare.play')}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              {isPlaying ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            {/* Speed selector */}
            <div className="flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSetSpeed(s)}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
                    s === 1 ? 'text-white/60' : 'text-white/40',
                    'hover:bg-white/10 hover:text-white',
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Viewer control toggle */}
            <button
              type="button"
              onClick={() => onToggleViewerControl(!allowViewerControl)}
              aria-label={allowViewerControl ? t('videoShare.viewerControlEnabled') : t('videoShare.viewerControlDisabled')}
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[10px] font-semibold transition-colors',
                allowViewerControl
                  ? 'border-green-500/40 bg-green-900/40 text-green-300'
                  : 'border-white/15 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white',
              )}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
              {allowViewerControl ? t('videoShare.viewerControlEnabled') : t('videoShare.allowViewerControl')}
            </button>
          </div>
        </div>
      )}

      {!isVideoLoaded && (
        <p className="text-center text-xs text-white/30">{t('videoShare.noVideoLoaded')}</p>
      )}

      {/* Warn the streamer that pausing means viewers see black */}
      {isVideoLoaded && !isPlaying && (
        <p className="flex items-center gap-1.5 rounded-xl border border-yellow-500/30 bg-yellow-900/30 px-2.5 py-1.5 text-[10px] font-semibold text-yellow-300">
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {t('videoShare.pausedViewersBlack')}
        </p>
      )}

      {/* Progress bar overlay when playing */}
      {isVideoLoaded && isPlaying && (
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
