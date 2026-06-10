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
  /** Current audio volume [0–1] */
  volume: number;
  isMuted: boolean;
  visible: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onShare: () => void;
  shareCopied: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** A compact pill in the centre-bottom of the viewer that combines playback + volume controls.
 *  It slides out to the left when `visible` is false.
 */
export function ViewerVideoControls({
  videoState,
  volume,
  isMuted,
  visible,
  onPlay,
  onPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onShare,
  shareCopied,
}: Props): React.ReactElement {
  const t = useTranslations('watch');
  const { playing, currentTime, duration, allowViewerControl } = videoState;
  const progress = duration > 0 ? currentTime / duration : 0;
  const displayVolume = isMuted ? 0 : volume;

  return (
    <div
      className={cn(
        'absolute bottom-8 left-1/2 -translate-x-1/2 z-20 w-[min(480px,90vw)]',
        'transition-opacity duration-300 ease-out',
        visible
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none',
      )}
      aria-label={t('videoControls.label')}
    >
      {/* ── Glass pill ── */}
      <div className="flex flex-col gap-2 rounded-2xl border border-white/15 bg-black/72 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-2xl">

        {/* ── Playback section (disabled when streamer locks control) ── */}
        <div
          className={cn(
            'flex flex-col gap-2',
            !allowViewerControl && 'pointer-events-none opacity-40',
          )}
        >
          {/* Progress / seek bar */}
          <div className="relative flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={(e) => allowViewerControl && onSeek(Number(e.target.value))}
              disabled={!allowViewerControl}
              aria-label={t('videoControls.seek')}
              className="h-1 flex-1 cursor-pointer accent-brand disabled:cursor-default"
              style={{
                background: `linear-gradient(to right, hsl(var(--brand)) ${progress * 100}%, rgba(255,255,255,0.12) ${progress * 100}%)`,
              }}
            />
          </div>

          {/* Play / Pause + time */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={playing ? onPause : onPlay}
              disabled={!allowViewerControl}
              aria-label={playing ? t('videoControls.pause') : t('videoControls.play')}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all duration-150 hover:scale-110 hover:bg-white/25 active:scale-90 disabled:cursor-default disabled:opacity-40"
            >
              {playing ? (
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="h-3 w-3 translate-x-px" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            <span className="min-w-[72px] text-[10px] tabular-nums text-white/45">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Thin separator */}
        {!allowViewerControl && (
          <div className="h-px w-full rounded-full bg-white/8" />
        )}

        {/* ── Volume + share row (ALWAYS interactive regardless of allowViewerControl) ── */}
        <div className="flex items-center gap-3">
          {/* Spacer so volume/share sit on the right */}
          <div className="flex-1" />

          {/* Mute toggle */}
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? t('volume.unmute') : t('volume.mute')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 transition-all duration-150 hover:bg-white/10 hover:text-white active:scale-90"
          >
            {isMuted || volume === 0 ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : volume < 0.5 ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
              </svg>
            )}
          </button>

          {/* Volume slider */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={displayVolume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            aria-label={t('volume.label')}
            className="h-1 w-20 cursor-pointer accent-white"
            style={{
              background: `linear-gradient(to right, rgba(255,255,255,0.85) ${displayVolume * 100}%, rgba(255,255,255,0.12) ${displayVolume * 100}%)`,
            }}
          />

          {/* Volume % */}
          <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-white/40">
            {Math.round(displayVolume * 100)}%
          </span>

          {/* Vertical divider */}
          <div className="h-4 w-px shrink-0 rounded-full bg-white/15" />

          {/* Share */}
          <button
            type="button"
            onClick={onShare}
            aria-label={t('share')}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[10px] font-semibold transition-all duration-200 active:scale-95',
              shareCopied
                ? 'border-green-400/30 bg-green-900/40 text-green-300'
                : 'border-white/18 bg-white/8 text-white/75 hover:border-white/30 hover:bg-white/15 hover:text-white',
            )}
          >
            {shareCopied ? (
              <>
                <svg className="h-3 w-3 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t('share')}
              </>
            ) : (
              <>
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                {t('share')}
              </>
            )}
          </button>
        </div>

        {/* ── Live progress strip ── */}
        <div className="h-px w-full overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full bg-gradient-to-r from-brand/60 to-brand transition-all duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {!allowViewerControl && (
          <p className="text-center text-[9px] font-medium text-white/25">
            {t('videoControls.controlDisabled')}
          </p>
        )}
      </div>
    </div>
  );
}
