'use client';

import { useEffect, useState, type MutableRefObject } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text.utils';
import { apiFetch } from '@/lib/api';
import type { Socket } from 'socket.io-client';

interface Viewer {
  id: string;
  displayName: string;
  joinedAt?: string;
}

interface Props {
  sessionId: string;
  apiBase: string;
  onClose: () => void;
  /** CSS class override for positioning — defaults to right side panel */
  className?: string;
  /** When true, shows the "show/hide to audience" toggle and per-viewer video control grants (sharer view) */
  showAudienceToggle?: boolean;
  viewersVisible?: boolean;
  onToggleViewersVisible?: (visible: boolean) => void;
  isTogglingVisibility?: boolean;
  /** Socket ref for live viewer tracking (streamer mode only) */
  socketRef?: MutableRefObject<Socket | null>;
  /** Set of viewer socket IDs currently granted video control */
  allowedViewerIds?: ReadonlySet<string>;
  /** Grant or revoke video control for a specific viewer */
  onGrantViewerControl?: (viewerId: string, allowed: boolean) => void;
  /** Whether the viewer-control feature is enabled (master switch) */
  videoControlEnabled?: boolean;
  /** Live viewer display names pushed from socket (viewer mode, bypasses REST stub) */
  publicViewerNames?: string[];
  /**
   * Embedded (control-room rail tab) variant: no own header/close button,
   * fills the parent and uses theme surface tokens instead of dark glass.
   */
  embedded?: boolean;
}

export function ViewersPanel({
  sessionId,
  apiBase,
  onClose,
  className,
  showAudienceToggle = false,
  viewersVisible = false,
  onToggleViewersVisible,
  isTogglingVisibility = false,
  socketRef,
  allowedViewerIds,
  onGrantViewerControl,
  videoControlEnabled = false,
  publicViewerNames,
  embedded = false,
}: Props): React.ReactElement {
  const t = useTranslations('watch');
  const tStream = useTranslations('stream');

  // Streamer mode: use live socket-based viewer list
  const [socketViewers, setSocketViewers] = useState<Viewer[]>([]);

  // Viewer mode: poll the REST endpoint (used only when publicViewerNames is not provided)
  const [restViewers, setRestViewers] = useState<Viewer[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(!showAudienceToggle && publicViewerNames === undefined);

  // Subscribe to viewers_update from the socket (streamer only).
  // Re-emitting join_as_streamer here requests a fresh snapshot from the server immediately
  // so the list isn't empty when the panel first opens.
  useEffect(() => {
    if (!showAudienceToggle || !socketRef) return;
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit('join_as_streamer');
    // Re-register after reconnects — the server-side registry is in-memory.
    const rejoin = (): void => { socket.emit('join_as_streamer'); };
    socket.on('connect', rejoin);

    const handler = (data: { viewers: Viewer[] }) => {
      setSocketViewers(data.viewers ?? []);
    };
    socket.on('viewers_update', handler);
    return () => {
      socket.off('viewers_update', handler);
      socket.off('connect', rejoin);
    };
  }, [showAudienceToggle, socketRef]);

  // Viewer mode: poll REST for the public audience list (skipped when publicViewerNames supplied)
  useEffect(() => {
    if (showAudienceToggle || publicViewerNames !== undefined) return;
    let cancelled = false;

    async function fetchViewers(): Promise<void> {
      try {
        const res = await apiFetch(`${apiBase}/sessions/${sessionId}/viewers`);
        if (!res.ok) { if (!cancelled) setIsLoading(false); return; }
        const { data } = (await res.json()) as { data: { viewers: Viewer[]; total: number } };
        if (!cancelled) {
          setRestViewers(data.viewers ?? []);
          setTotal(data.total ?? 0);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchViewers();
    const interval = setInterval(() => { void fetchViewers(); }, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sessionId, apiBase, showAudienceToggle, publicViewerNames]);

  const viewers = showAudienceToggle
    ? socketViewers
    : publicViewerNames !== undefined
      ? publicViewerNames.map((name) => ({ id: name, displayName: name }))
      : restViewers;
  const displayTotal = showAudienceToggle
    ? socketViewers.length
    : publicViewerNames !== undefined
      ? publicViewerNames.length
      : total;

  return (
    <div
      className={cn(
        embedded
          ? 'flex h-full min-h-0 flex-col'
          : 'flex flex-col border-white/20 bg-black/80 backdrop-blur-2xl',
        embedded ? className : (className ?? 'absolute inset-y-0 right-0 z-40 w-72 border-l sm:w-80'),
      )}
    >
      {/* Header — the embedded variant gets its title from the rail tab */}
      {!embedded && (
      <div className="flex items-center justify-between border-b border-white/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 text-white/50"
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
          <span className="text-sm font-semibold text-white">{t('viewersList')}</span>
          {displayTotal > 0 && (
            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
              {displayTotal}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        >
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      )}

      {/* Audience visibility toggle (sharer only) */}
      {showAudienceToggle && (
        <div
          className={cn(
            'flex items-center justify-between border-b px-4 py-2.5',
            embedded
              ? 'border-[var(--card-border-color)] bg-muted/40'
              : 'border-white/10 bg-white/[0.04]',
          )}
        >
          <span className={cn('text-xs', embedded ? 'text-muted-foreground' : 'text-white/60')}>
            {viewersVisible
              ? tStream('viewers.showAudience')
              : tStream('viewers.hideAudience')}
          </span>
          <button
            type="button"
            onClick={() => onToggleViewersVisible?.(!viewersVisible)}
            disabled={isTogglingVisibility}
            aria-label={
              viewersVisible
                ? tStream('viewers.hideAudience')
                : tStream('viewers.showAudience')
            }
            className={cn(
              'relative h-5 w-9 rounded-full border transition-colors focus:outline-none disabled:opacity-50',
              viewersVisible
                ? 'border-brand/50 bg-brand'
                : embedded
                  ? 'border-[var(--input-border-color)] bg-muted'
                  : 'border-white/20 bg-white/10',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                viewersVisible ? 'left-[18px]' : 'left-0.5',
              )}
            />
          </button>
        </div>
      )}

      {/* Video-control section header (streamer only, when feature enabled) */}
      {showAudienceToggle && videoControlEnabled && viewers.length > 0 && (
        <div
          className={cn(
            'border-b px-4 py-2',
            embedded ? 'border-[var(--card-border-color)]' : 'border-white/10 bg-white/[0.02]',
          )}
        >
          <p
            className={cn(
              'text-[10px] font-semibold uppercase tracking-widest',
              embedded ? 'text-muted-foreground/70' : 'text-white/35',
            )}
          >
            {tStream('viewers.videoControl')}
          </p>
        </div>
      )}

      {/* Viewer list */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading ? (
          <div className="flex justify-center pt-12">
            <svg
              className="h-5 w-5 animate-spin text-white/30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          </div>
        ) : viewers.length === 0 ? (
          <p
            className={cn(
              'mt-12 text-center text-xs',
              embedded ? 'text-muted-foreground/60' : 'text-white/25',
            )}
          >
            {t('noViewers')}
          </p>
        ) : (
          viewers.map((viewer) => {
            const hasControl = allowedViewerIds?.has(viewer.id) ?? false;
            return (
              <div key={viewer.id} className="flex items-center gap-3 px-4 py-2.5">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                    embedded ? 'bg-muted text-muted-foreground' : 'bg-white/10 text-white/70',
                  )}
                >
                  {getInitials(viewer.displayName)}
                </div>
                <span
                  className={cn(
                    'flex-1 truncate text-sm',
                    embedded ? 'text-foreground' : 'text-white/80',
                  )}
                >
                  {viewer.displayName}
                </span>
                {/* Per-viewer video control toggle — only in streamer mode when feature is enabled */}
                {showAudienceToggle && videoControlEnabled && onGrantViewerControl && (
                  <button
                    type="button"
                    onClick={() => onGrantViewerControl(viewer.id, !hasControl)}
                    aria-label={
                      hasControl
                        ? tStream('viewers.revokeVideoControl')
                        : tStream('viewers.grantVideoControl')
                    }
                    title={
                      hasControl
                        ? tStream('viewers.revokeVideoControl')
                        : tStream('viewers.grantVideoControl')
                    }
                    className={cn(
                      'relative h-5 w-9 shrink-0 rounded-full border transition-colors focus:outline-none',
                      hasControl
                        ? 'border-green-500/50 bg-green-600'
                        : embedded
                          ? 'border-[var(--input-border-color)] bg-muted'
                          : 'border-white/20 bg-white/10',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                        hasControl ? 'left-[18px]' : 'left-0.5',
                      )}
                    />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
