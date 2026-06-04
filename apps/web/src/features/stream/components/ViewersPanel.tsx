'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/text.utils';
import { apiFetch } from '@/lib/api';

interface Viewer {
  id: string;
  displayName: string;
  joinedAt: string;
}

interface Props {
  sessionId: string;
  apiBase: string;
  onClose: () => void;
  /** CSS class override for positioning — defaults to right side panel */
  className?: string;
  /** When true, shows the "show/hide to audience" toggle (sharer view) */
  showAudienceToggle?: boolean;
  viewersVisible?: boolean;
  onToggleViewersVisible?: (visible: boolean) => void;
  isTogglingVisibility?: boolean;
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
}: Props): React.ReactElement {
  const t = useTranslations('watch');
  const tStream = useTranslations('stream');

  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchViewers(): Promise<void> {
      try {
        const res = await apiFetch(`${apiBase}/sessions/${sessionId}/viewers`);
        if (!res.ok) {
          if (!cancelled) setIsLoading(false);
          return;
        }
        const { data } = (await res.json()) as {
          data: { viewers: Viewer[]; total: number };
        };
        if (!cancelled) {
          setViewers(data.viewers ?? []);
          setTotal(data.total ?? 0);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchViewers();
    const interval = setInterval(() => { void fetchViewers(); }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, apiBase]);

  return (
    <div
      className={cn(
        'flex flex-col border-white/20 bg-black/80 backdrop-blur-2xl',
        className ?? 'absolute inset-y-0 right-0 z-40 w-72 border-l sm:w-80',
      )}
    >
      {/* Header */}
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
          {total > 0 && (
            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">
              {total}
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

      {/* Audience toggle (sharer only) */}
      {showAudienceToggle && (
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
          <span className="text-xs text-white/60">
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
          <p className="mt-12 text-center text-xs text-white/25">
            {t('noViewers')}
          </p>
        ) : (
          viewers.map((viewer) => (
            <div key={viewer.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white/70">
                {getInitials(viewer.displayName)}
              </div>
              <span className="flex-1 truncate text-sm text-white/80">
                {viewer.displayName}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
