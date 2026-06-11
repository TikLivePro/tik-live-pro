'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface Props {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  allowViewerControl: boolean;
  isVideoLoaded: boolean;
  isBuffering: boolean;
  isQualitySwitching?: boolean;
  bufferedAhead: number;
  bufferedRanges: Array<{ start: number; end: number }>;
  loadError: string | null;
  videoVolume: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onSetSpeed: (rate: number) => void;
  onToggleViewerControl: (allow: boolean) => void;
  onSetVideoVolume: (volume: number) => void;
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
  isBuffering,
  isQualitySwitching = false,
  bufferedAhead,
  bufferedRanges,
  loadError,
  videoVolume,
  onPlay,
  onPause,
  onSeek,
  onSetSpeed,
  onToggleViewerControl,
  onSetVideoVolume,
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

          {/* Buffer track — each segment the browser has pre-fetched is shown separately */}
          {duration > 0 && (
            <div className="relative h-px w-full rounded-full bg-white/10">
              {bufferedRanges.map((range) => {
                const left = (range.start / duration) * 100;
                const width = ((range.end - range.start) / duration) * 100;
                return (
                  <div
                    key={range.start}
                    className="absolute h-full bg-white/30 transition-[left,width] duration-300"
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                );
              })}
            </div>
          )}

          {/* Time */}
          <div className="flex items-center justify-between text-[10px] tabular-nums text-white/40">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Quality-switch indicator — takes priority over buffering since the source is reloading */}
          {isQualitySwitching ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-900/20 px-2.5 py-1 text-[10px] font-semibold text-blue-300">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-blue-300 border-t-transparent" />
              {t('videoShare.sourceQualityChanging')}
            </div>
          ) : isBuffering && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-900/20 px-2.5 py-1 text-[10px] font-semibold text-amber-300">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-amber-300 border-t-transparent" />
              {t('videoShare.buffering')}
            </div>
          )}

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
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
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
              aria-label={
                allowViewerControl
                  ? t('videoShare.viewerControlEnabled')
                  : t('videoShare.viewerControlDisabled')
              }
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[10px] font-semibold transition-colors',
                allowViewerControl
                  ? 'border-green-500/40 bg-green-900/40 text-green-300'
                  : 'border-white/15 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white',
              )}
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
              {allowViewerControl
                ? t('videoShare.viewerControlEnabled')
                : t('videoShare.allowViewerControl')}
            </button>
          </div>

          {/* Volume control - streamer's local monitoring */}
          <div className="flex items-center gap-2 border-t border-white/10 pt-2">
            <svg
              className="h-3.5 w-3.5 shrink-0 text-white/40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {videoVolume === 0 ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              ) : videoVolume < 50 ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              ) : (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              )}
            </svg>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={videoVolume}
              onChange={(e) => onSetVideoVolume(Number(e.target.value))}
              aria-label={t('videoShare.volume')}
              className="h-1 flex-1 cursor-pointer accent-brand"
            />
            <span className="min-w-[2.5rem] text-right text-[10px] tabular-nums text-white/40">
              {videoVolume}%
            </span>
          </div>
        </div>
      )}

      {loadError && (
        <p className="flex items-start gap-1.5 rounded-xl border border-red-500/30 bg-red-900/30 px-2.5 py-2 text-[10px] font-semibold text-red-300">
          <svg
            className="mt-0.5 h-3 w-3 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {loadError}
        </p>
      )}

      {!isVideoLoaded && !loadError && (
        <p className="text-center text-xs text-white/30">{t('videoShare.noVideoLoaded')}</p>
      )}

      {/* Warn the streamer that pausing means viewers see black */}
      {isVideoLoaded && !isPlaying && (
        <p className="flex items-center gap-1.5 rounded-xl border border-yellow-500/30 bg-yellow-900/30 px-2.5 py-1.5 text-[10px] font-semibold text-yellow-300">
          <svg
            className="h-3 w-3 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {t('videoShare.pausedViewersBlack')}
        </p>
      )}

      {/* Progress bar overlay when playing */}
      {isVideoLoaded && isPlaying && (
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-brand transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}
