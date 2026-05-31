'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface Props {
  stream: MediaStream | null;
  elapsed: string;
  isPaused?: boolean;
  isPausing?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onRestore: () => void;
  onGoHome?: () => void;
}

const W = 176;
const H = 99; // 16:9

export function MinimizedPlayer({
  stream,
  elapsed,
  isPaused = false,
  isPausing = false,
  onPause,
  onResume,
  onRestore,
  onGoHome,
}: Props): React.ReactElement {
  const t = useTranslations('stream');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [pos, setPos] = useState({ x: -1, y: -1 });
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragOrigin = useRef({ startX: 0, startY: 0, elemX: 0, elemY: 0 });

  useEffect(() => {
    const margin = 16;
    setPos({ x: window.innerWidth - W - margin, y: window.innerHeight - H - margin });
  }, []);

  // Callback ref — fires when the <video> element first mounts AND whenever stream changes,
  // so srcObject is always set regardless of the pos-based conditional render ordering.
  const videoCallbackRef = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (el) el.srcObject = stream;
    },
    [stream],
  );

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = true;
    setIsDragging(true);
    dragOrigin.current = { startX: e.clientX, startY: e.clientY, elemX: pos.x, elemY: pos.y };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragOrigin.current.startX;
    const dy = e.clientY - dragOrigin.current.startY;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - W, dragOrigin.current.elemX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - H, dragOrigin.current.elemY + dy)),
    });
  }

  function onPointerUp() {
    isDraggingRef.current = false;
    setIsDragging(false);
  }

  const hasPauseResume = onPause !== undefined || onResume !== undefined;

  if (pos.x === -1) return <></>;

  return (
    <div
      className={cn(
        'fixed z-[9999] overflow-hidden rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/[0.18] select-none',
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
      style={{ left: pos.x, top: pos.y, width: W, height: H }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Video feed */}
      <video
        ref={videoCallbackRef}
        autoPlay
        muted
        playsInline
        className="h-full w-full bg-[#0f1117] object-cover"
      />

      {/* Bottom bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-white/20 bg-black/55 px-2 py-1 backdrop-blur-xl">
        {/* Status badge */}
        <span
          className={cn(
            'flex items-center gap-1 text-[9px] font-bold pointer-events-none',
            isPaused ? 'text-yellow-400' : 'text-red-400',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              isPaused ? 'bg-yellow-400' : 'animate-pulse bg-red-500',
            )}
          />
          {isPaused ? t('status.paused') : 'LIVE'}
        </span>

        {/* Pause / Resume */}
        {hasPauseResume && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              isPaused ? onResume?.() : onPause?.();
            }}
            disabled={isPausing}
            aria-label={isPaused ? t('resumeLive') : t('pauseLive')}
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded transition-colors disabled:opacity-40',
              isPaused
                ? 'text-yellow-300 hover:text-yellow-100'
                : 'text-white/70 hover:text-white',
            )}
          >
            {isPaused ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            )}
          </button>
        )}

        {/* Elapsed + home */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] tabular-nums text-white/70 pointer-events-none">{elapsed}</span>
          {onGoHome && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onGoHome(); }}
              aria-label="Dashboard"
              className="flex h-5 w-5 items-center justify-center rounded text-white/70 hover:text-white transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Hover overlay — purely decorative dim, pointer-events-none so it never blocks clicks */}
      {hovered && !isDragging && (
        <div className="pointer-events-none absolute inset-0 bg-black/40 backdrop-blur-sm" />
      )}

      {/* Always-visible expand button — rendered last so it sits above the overlay */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRestore(); }}
        aria-label={t('restore')}
        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-black/55 text-white/80 backdrop-blur-xl transition-colors hover:bg-black/75 hover:text-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>
    </div>
  );
}
