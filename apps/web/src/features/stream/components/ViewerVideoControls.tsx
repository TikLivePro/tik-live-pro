'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export interface ViewerVideoState {
  sourceType?: 'camera' | 'local-file' | 'online-url';
  playing: boolean;
  currentTime: number;
  duration: number;
  allowViewerControl: boolean;
}

interface Props {
  videoState: ViewerVideoState;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ViewerVideoControls({ videoState, onPlay, onPause, onSeek }: Props): React.ReactElement {
  const t = useTranslations('watch');
  const { playing, currentTime, duration, allowViewerControl } = videoState;
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-20 z-20 mx-4 flex flex-col gap-2 rounded-2xl border border-white/15 bg-black/70 p-3 backdrop-blur-xl transition-opacity',
        !allowViewerControl && 'pointer-events-none opacity-40',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
          {t('videoControls.label')}
        </span>
        {!allowViewerControl && (
          <span className="text-[9px] text-white/30">{t('videoControls.controlDisabled')}</span>
        )}
      </div>

      {/* Progress bar / seek */}
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={currentTime}
        onChange={(e) => allowViewerControl && onSeek(Number(e.target.value))}
        disabled={!allowViewerControl}
        aria-label={t('videoControls.seek')}
        className="h-1 w-full cursor-pointer accent-brand disabled:cursor-default"
      />

      <div className="flex items-center gap-3">
        {/* Play / pause */}
        <button
          type="button"
          onClick={playing ? onPause : onPlay}
          disabled={!allowViewerControl}
          aria-label={playing ? t('videoControls.pause') : t('videoControls.play')}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:cursor-default disabled:opacity-40"
        >
          {playing ? (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>

        {/* Time */}
        <span className="text-[10px] tabular-nums text-white/40">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Live progress dot */}
        <div className="flex-1 overflow-hidden rounded-full bg-white/10" style={{ height: 3 }}>
          <div
            className="h-full bg-brand/70 transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
