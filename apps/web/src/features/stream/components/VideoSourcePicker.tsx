'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { VideoSourceType, RecentSource } from '../interfaces/video-share.interfaces';
import { detectVideoPlatform, isUnsafeVideoUrl } from '../consts/video-url.utils';
import { resolveVideoProxyUrl, buildMergeStreamUrl } from '@/lib/api';

const INITIAL_SHOWN = 3;
const PAGE_SIZE = 5;

export interface ResolvedPlatformContext {
  platformUrl: string;
  availableHeights: number[];
  selectedHeight: number;
  effectiveUrl: string;
}

interface Props {
  sourceType: VideoSourceType;
  recentSources?: RecentSource[];
  cameraDisabled?: boolean;
  onSelectCamera: () => void;
  onSelectLocalFile: (file: File) => void;
  onSelectOnlineUrl: (url: string) => void;
  /**
   * Called when the user switches to a different quality of the *already-playing* video.
   * Should use `switchOnlineUrl` (not `loadOnlineUrl`) so playback continues from the
   * current timestamp instead of restarting.
   */
  onSwitchQuality?: (url: string) => void;
  onSelectRecentSource?: (source: RecentSource) => void;
  /** Called after a platform URL is successfully resolved, with the full resolution context. */
  onResolved?: (ctx: ResolvedPlatformContext) => void;
  /** Filename of the currently loaded local file — shown next to the "Load file" button. */
  currentFileName?: string | undefined;
  /** Currently loaded URL — pre-fills the URL input when the online-url tab opens. */
  currentUrl?: string | undefined;
}

function RecentIcon({ type }: { type: RecentSource['type'] }): React.ReactElement {
  if (type === 'local-file') {
    return (
      <svg className="h-3 w-3 shrink-0 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }
  return (
    <svg className="h-3 w-3 shrink-0 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

export function VideoSourcePicker({
  sourceType,
  recentSources = [],
  cameraDisabled = false,
  onSelectCamera,
  onSelectLocalFile,
  onSelectOnlineUrl,
  onSwitchQuality,
  onSelectRecentSource,
  onResolved,
  currentFileName,
  currentUrl,
}: Props): React.ReactElement {
  const t = useTranslations('stream');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState(currentUrl ?? '');
  const [pendingTab, setPendingTab] = useState<VideoSourceType>(sourceType);
  const [urlUnsafe, setUrlUnsafe] = useState(false);
  const [urlPlatform, setUrlPlatform] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [availableHeights, setAvailableHeights] = useState<number[] | null>(null);
  const [selectedHeight, setSelectedHeight] = useState<number | null>(null);
  const [resolvedPlatformUrl, setResolvedPlatformUrl] = useState<string | null>(null);

  // History popup state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(recentSources.length / PAGE_SIZE);
  const pagedSources = recentSources.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const previewSources = recentSources.slice(0, INITIAL_SHOWN);
  const hiddenCount = recentSources.length - INITIAL_SHOWN;

  // Run platform detection on the initial URL (pre-filled from currentUrl prop).
  useEffect(() => {
    if (!currentUrl) return;
    const trimmed = currentUrl.trim();
    if (!trimmed) return;
    setUrlUnsafe(isUnsafeVideoUrl(trimmed));
    setUrlPlatform(detectVideoPlatform(trimmed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When switching to online-url tab with no input yet and a currentUrl is available, fill it.
  useEffect(() => {
    if (pendingTab !== 'online-url' || urlInput || !currentUrl) return;
    handleUrlChange(currentUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTab]);

  function handleTabClick(tab: VideoSourceType): void {
    if (tab === 'camera' && cameraDisabled) return;
    setPendingTab(tab);
    if (tab === 'camera') onSelectCamera();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) onSelectLocalFile(file);
    e.target.value = '';
  }

  function handleUrlChange(value: string): void {
    setUrlInput(value);
    setResolveError(null);
    // Reset quality state when the URL changes
    setAvailableHeights(null);
    setSelectedHeight(null);
    setResolvedPlatformUrl(null);
    const trimmed = value.trim();
    if (!trimmed) {
      setUrlUnsafe(false);
      setUrlPlatform(null);
      return;
    }
    setUrlUnsafe(isUnsafeVideoUrl(trimmed));
    setUrlPlatform(detectVideoPlatform(trimmed));
  }

  /**
   * Resolves `platformUrl` via the server and calls `onSelectOnlineUrl` with
   * the playable URL.  When the backend returns separate DASH video+audio URLs,
   * constructs the server-side merge-stream URL so the browser receives a
   * single streamable response.
   *
   * Accepts the URL explicitly to avoid the async React state-update race
   * that would occur if we read `urlInput` after a state setter fires.
   */
  async function doResolve(platformUrl: string, height?: number): Promise<void> {
    if (!platformUrl || isResolving) return;
    setIsResolving(true);
    setResolveError(null);
    try {
      // Cap at 1080p on first resolve; explicit height is used for quality switches
    const result = await resolveVideoProxyUrl(platformUrl, height ?? 1080);

      // Prefer 1080p as default; fall back to best available if 1080p isn't in the list
      const resolvedHeight = height ?? (
        result.availableHeights.includes(1080) ? 1080 : (result.availableHeights[0] ?? null)
      );

      if (height === undefined) {
        setAvailableHeights(result.availableHeights);
        setSelectedHeight(resolvedHeight);
        setResolvedPlatformUrl(platformUrl);
      } else {
        setSelectedHeight(height);
      }

      // When DASH: video and audio are separate CDN streams. Route them through
      // the server-side merge endpoint so the browser gets a single MP4 stream
      // and captureStream() can capture full-quality video.
      const effectiveUrl = result.audioUrl
        ? buildMergeStreamUrl(result.resolvedUrl, result.audioUrl)
        : result.resolvedUrl;

      if (height !== undefined) {
        // Quality switch — don't reset the URL input; continue from current position.
        onSwitchQuality?.(effectiveUrl);
      } else {
        setUrlInput(platformUrl);
        setUrlPlatform(null);
        onSelectOnlineUrl(effectiveUrl);
      }

      const heights = result.availableHeights.length > 0
        ? result.availableHeights
        : (availableHeights ?? []);
      if (heights.length > 0) {
        onResolved?.({
          platformUrl,
          availableHeights: heights,
          selectedHeight: resolvedHeight ?? heights[0] ?? 0,
          effectiveUrl,
        });
      }
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : t('videoShare.urlResolveFailed'));
    } finally {
      setIsResolving(false);
    }
  }

  function handleResolveUrl(): void {
    void doResolve(urlInput.trim());
  }

  function handleQualitySelect(height: number): void {
    if (!resolvedPlatformUrl || isResolving) return;
    void doResolve(resolvedPlatformUrl, height);
  }

  function handleLoadUrl(): void {
    const trimmed = urlInput.trim();
    if (!trimmed || urlUnsafe || urlPlatform) return;
    onSelectOnlineUrl(trimmed);
  }

  function handleRecentClick(source: RecentSource, closePopup = false): void {
    if (onSelectRecentSource) {
      onSelectRecentSource(source);
    } else if (source.type === 'local-file') {
      onSelectLocalFile(source.file);
    } else {
      onSelectOnlineUrl(source.url);
    }
    setPendingTab(source.type);
    if (closePopup) setHistoryOpen(false);
  }

  function openHistory(): void {
    setPage(0);
    setHistoryOpen(true);
  }

  const tabBase = 'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors';
  const tabActive = 'bg-white/15 text-white';
  const tabInactive = 'text-white/40 hover:text-white/70';
  const tabDisabled = 'text-white/20 cursor-not-allowed';

  return (
    <>
      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
        {/* Source tabs */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleTabClick('camera')}
            disabled={cameraDisabled}
            title={cameraDisabled ? t('camera.notDetected') : undefined}
            className={cn(tabBase, cameraDisabled ? tabDisabled : pendingTab === 'camera' ? tabActive : tabInactive)}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            {t('videoShare.camera')}
          </button>

          <button type="button" onClick={() => handleTabClick('local-file')} className={cn(tabBase, pendingTab === 'local-file' ? tabActive : tabInactive)}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            {t('videoShare.localFile')}
          </button>

          <button type="button" onClick={() => handleTabClick('online-url')} className={cn(tabBase, pendingTab === 'online-url' ? tabActive : tabInactive)}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 014-10z" />
            </svg>
            {t('videoShare.onlineUrl')}
          </button>
        </div>

        {/* Contextual input */}
        {pendingTab === 'local-file' && (
          <div className="flex flex-col gap-1.5">
            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                sourceType === 'local-file' && currentFileName
                  ? 'border-brand/40 bg-brand/20 text-brand'
                  : 'border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
              )}
            >
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {sourceType === 'local-file' && currentFileName ? (
                <span className="min-w-0 truncate">{currentFileName}</span>
              ) : (
                <span className="flex-1 text-center">{t('videoShare.loadFile')}</span>
              )}
            </button>
          </div>
        )}

        {pendingTab === 'online-url' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLoadUrl(); }}
                placeholder={t('videoShare.urlPlaceholder')}
                className={cn(
                  'min-w-0 flex-1 rounded-xl border bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none transition-colors',
                  urlUnsafe
                    ? 'border-red-500/50 focus:border-red-500/70'
                    : urlPlatform
                    ? 'border-amber-500/40 focus:border-amber-500/60'
                    : 'border-white/15 focus:border-white/30',
                )}
              />
              <button
                type="button"
                onClick={handleLoadUrl}
                disabled={!urlInput.trim() || urlUnsafe || !!urlPlatform}
                className="rounded-xl border border-brand/40 bg-brand/20 px-3 py-1.5 text-xs font-semibold text-brand transition-opacity disabled:opacity-40"
              >
                {t('videoShare.loadUrl')}
              </button>
            </div>

            {urlUnsafe && (
              <p className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-900/20 px-2.5 py-1 text-[10px] font-semibold text-red-300">
                <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {t('videoShare.urlUnsafeBlocked')}
              </p>
            )}

            {!urlUnsafe && urlPlatform && (
              <div className="flex flex-col gap-1">
                <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-900/20 px-2.5 py-1.5 text-[10px] font-semibold text-amber-300">
                  <svg className="mt-px h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  {t('videoShare.urlPlatformDetected')}
                </p>
                <button
                  type="button"
                  onClick={handleResolveUrl}
                  disabled={isResolving}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-900/30 px-2.5 py-1 text-[10px] font-semibold text-amber-200 transition-opacity hover:bg-amber-900/50 disabled:opacity-50"
                >
                  {isResolving ? (
                    <>
                      <span className="h-2.5 w-2.5 animate-spin rounded-full border border-amber-300 border-t-transparent" />
                      {t('videoShare.urlResolving')}
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      {t('videoShare.urlResolve')}
                    </>
                  )}
                </button>
                {resolveError && (
                  <p className="rounded-lg border border-red-500/30 bg-red-900/20 px-2.5 py-1 text-[10px] font-semibold text-red-300">
                    {resolveError}
                  </p>
                )}
              </div>
            )}

            {/* Source quality picker — shown after a platform URL has been resolved */}
            {!urlUnsafe && !urlPlatform && availableHeights !== null && availableHeights.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-white/30">
                  {t('videoShare.sourceQualityLabel')}
                </span>
                <div className="flex flex-wrap gap-1">
                  {availableHeights.map((h) => {
                    const isActive = selectedHeight === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        disabled={isResolving}
                        onClick={() => handleQualitySelect(h)}
                        className={cn(
                          'rounded-lg border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40',
                          isActive
                            ? 'border-brand/60 bg-brand/20 text-brand'
                            : 'border-white/15 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white',
                        )}
                      >
                        {isResolving && isActive ? (
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 animate-spin rounded-full border border-current border-t-transparent" />
                            {h}p
                          </span>
                        ) : (
                          `${h}p`
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent — preview strip */}
        {recentSources.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-white/30">
                {t('videoShare.recent')}
              </span>
              {hiddenCount > 0 && (
                <span className="text-[9px] text-white/25">
                  {recentSources.length} {t('videoShare.total')}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              {previewSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => handleRecentClick(source)}
                  title={source.name}
                  className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/5 px-2.5 py-1.5 text-left text-[10px] text-white/60 transition-colors hover:border-white/15 hover:bg-white/10 hover:text-white"
                >
                  <RecentIcon type={source.type} />
                  <span className="min-w-0 truncate">{source.name}</span>
                </button>
              ))}
            </div>

            {/* Load more */}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={openHistory}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-1.5 text-[10px] font-semibold text-white/40 transition-colors hover:border-white/20 hover:bg-white/8 hover:text-white/70"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                {t('videoShare.loadMore', { count: hiddenCount })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* History popup — fixed overlay so it escapes any stacking context */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-2xl border border-white/15 bg-black/90 p-4 shadow-2xl backdrop-blur-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">{t('videoShare.historyTitle')}</span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={t('videoShare.historyClose')}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Paginated list */}
            <div className="flex flex-col gap-1">
              {pagedSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => handleRecentClick(source, true)}
                  title={source.name}
                  className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-left text-xs text-white/60 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  <RecentIcon type={source.type} />
                  <span className="min-w-0 flex-1 truncate">{source.name}</span>
                  <svg className="h-3 w-3 shrink-0 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-white/10 pt-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-white/40 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  {t('videoShare.historyPrev')}
                </button>

                <span className="text-[10px] tabular-nums text-white/30">
                  {t('videoShare.historyPage', { current: page + 1, total: totalPages })}
                </span>

                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-white/40 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                >
                  {t('videoShare.historyNext')}
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
