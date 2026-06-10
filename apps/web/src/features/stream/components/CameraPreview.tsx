'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useCameraStream } from '../hooks/useCameraStream';

interface Props {
  autoStart?: boolean;
  className?: string;
}

export function CameraPreview({ autoStart = false, className }: Props): React.ReactElement {
  const t = useTranslations('stream');
  const { videoRef, state, isMicMuted, isCameraOff, start, toggleMic, toggleCamera } =
    useCameraStream(autoStart);

  const isActive = state === 'active';

  return (
    <div className={cn('relative overflow-hidden rounded-2xl bg-slate-900', className)}>
      {/* Video element is always mounted so the ref is valid when the stream starts */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={cn(
          'aspect-video w-full object-cover',
          isCameraOff && 'opacity-0',
        )}
      />

      {/* Idle / requesting / error overlays */}
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center">
          {state === 'idle' && (
            <div className="space-y-3 px-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                <svg
                  className="h-6 w-6 text-slate-300"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
              </div>
              <p className="text-sm text-slate-400">{t('camera.preview')}</p>
              <button
                type="button"
                onClick={() => void start()}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
              >
                {t('camera.start')}
              </button>
            </div>
          )}

          {state === 'requesting' && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              {t('camera.requesting')}
            </div>
          )}

          {state === 'denied' && (
            <div className="space-y-1.5 px-6 text-center">
              <p className="text-sm font-semibold text-red-400">{t('camera.denied')}</p>
              <p className="text-xs text-slate-500">{t('camera.deniedHint')}</p>
            </div>
          )}

          {state === 'unavailable' && (
            <div className="space-y-1.5 px-6 text-center">
              <p className="text-sm font-semibold text-slate-400">{t('camera.notDetected')}</p>
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-3 px-6 text-center">
              <p className="text-sm font-semibold text-red-400">{t('camera.error')}</p>
              <button
                type="button"
                onClick={() => void start()}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
              >
                {t('camera.retry')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Live controls — shown when camera is active */}
      {isActive && (
        <div className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 pt-6">
          <button
            type="button"
            onClick={toggleMic}
            title={isMicMuted ? t('camera.unmute') : t('camera.mute')}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
              isMicMuted ? 'bg-red-600 text-white' : 'bg-white/15 text-white hover:bg-white/25',
            )}
          >
            {isMicMuted ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
                <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 20v4M8 20h8" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={toggleCamera}
            title={isCameraOff ? t('camera.showCamera') : t('camera.hideCamera')}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
              isCameraOff ? 'bg-red-600 text-white' : 'bg-white/15 text-white hover:bg-white/25',
            )}
          >
            {isCameraOff ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10M1 1l22 22" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
