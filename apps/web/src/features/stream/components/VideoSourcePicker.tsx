'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { VideoSourceType, RecentSource } from '../interfaces/video-share.interfaces';

const INITIAL_SHOWN = 3;
const PAGE_SIZE = 5;

interface Props {
  sourceType: VideoSourceType;
  recentSources?: RecentSource[];
  onSelectCamera: () => void;
  onSelectLocalFile: (file: File) => void;
  onSelectOnlineUrl: (url: string) => void;
  onSelectRecentSource?: (source: RecentSource) => void;
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
  onSelectCamera,
  onSelectLocalFile,
  onSelectOnlineUrl,
  onSelectRecentSource,
}: Props): React.ReactElement {
  const t = useTranslations('stream');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [pendingTab, setPendingTab] = useState<VideoSourceType>(sourceType);

  // History popup state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(recentSources.length / PAGE_SIZE);
  const pagedSources = recentSources.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const previewSources = recentSources.slice(0, INITIAL_SHOWN);
  const hiddenCount = recentSources.length - INITIAL_SHOWN;

  function handleTabClick(tab: VideoSourceType): void {
    setPendingTab(tab);
    if (tab === 'camera') onSelectCamera();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) onSelectLocalFile(file);
    e.target.value = '';
  }

  function handleLoadUrl(): void {
    const trimmed = urlInput.trim();
    if (trimmed) onSelectOnlineUrl(trimmed);
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

  return (
    <>
      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
        {/* Source tabs */}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => handleTabClick('camera')} className={cn(tabBase, pendingTab === 'camera' ? tabActive : tabInactive)}>
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
          <div>
            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl border py-2 text-xs font-semibold transition-colors',
                sourceType === 'local-file'
                  ? 'border-brand/40 bg-brand/20 text-brand'
                  : 'border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
              )}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {t('videoShare.loadFile')}
            </button>
          </div>
        )}

        {pendingTab === 'online-url' && (
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLoadUrl(); }}
              placeholder={t('videoShare.urlPlaceholder')}
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/30"
            />
            <button
              type="button"
              onClick={handleLoadUrl}
              disabled={!urlInput.trim()}
              className="rounded-xl border border-brand/40 bg-brand/20 px-3 py-1.5 text-xs font-semibold text-brand transition-opacity disabled:opacity-40"
            >
              {t('videoShare.loadUrl')}
            </button>
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
