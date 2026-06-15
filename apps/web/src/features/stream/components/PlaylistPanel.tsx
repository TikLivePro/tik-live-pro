'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { PlaylistItem } from '../interfaces/video-share.interfaces';
import { isUnsafeVideoUrl, detectVideoPlatform } from '../consts/video-url.utils';

interface Props {
  items: PlaylistItem[];
  currentIndex: number;
  onPlayAt: (index: number) => void;
  onRemove: (id: string) => void;
  onAddFiles: (files: File[]) => void;
  onAddUrl: (url: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function PlaylistPanel({
  items,
  currentIndex,
  onPlayAt,
  onRemove,
  onAddFiles,
  onAddUrl,
  onClear,
  onClose,
}: Props): React.ReactElement {
  const t = useTranslations('stream');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onAddFiles(files);
    e.target.value = '';
  }

  function handleAddUrl(): void {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (isUnsafeVideoUrl(trimmed)) {
      setUrlError(t('videoShare.urlUnsafeBlocked'));
      return;
    }
    if (detectVideoPlatform(trimmed)) {
      setUrlError(t('playlist.urlPlatformHint'));
      return;
    }
    onAddUrl(trimmed);
    setUrlInput('');
    setUrlError(null);
  }

  function handleUrlChange(value: string): void {
    setUrlInput(value);
    setUrlError(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white">{t('playlist.title')}</span>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg px-2 py-0.5 text-[10px] font-semibold text-white/30 transition-colors hover:bg-white/10 hover:text-white/70"
            >
              {t('playlist.clear')}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={t('videoShare.historyClose')}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Add controls */}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => handleUrlChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddUrl(); }}
            placeholder={t('playlist.urlPlaceholder')}
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none transition-colors focus:border-white/30"
          />
          <button
            type="button"
            onClick={handleAddUrl}
            disabled={!urlInput.trim()}
            className="rounded-xl border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/15 disabled:opacity-40"
          >
            {t('playlist.addUrl')}
          </button>
        </div>
        {urlError && (
          <p className="text-[10px] font-semibold text-red-300">{urlError}</p>
        )}
        <input ref={fileInputRef} type="file" accept="video/*" multiple className="hidden" onChange={handleFileChange} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-1.5 text-xs font-semibold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          {t('playlist.addFile')}
        </button>
      </div>

      {/* Playlist items */}
      {items.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-white/30">{t('playlist.empty')}</p>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: '240px' }}>
          {items.map((item, index) => {
            const isActive = index === currentIndex;
            return (
              <div
                key={item.id}
                className={cn(
                  'group flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors',
                  isActive
                    ? 'border-brand/40 bg-brand/15'
                    : 'border-white/8 bg-white/5 hover:border-white/15 hover:bg-white/8',
                )}
              >
                {/* Index / play indicator */}
                <button
                  type="button"
                  onClick={() => onPlayAt(index)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center"
                  aria-label={t('playlist.playItem')}
                >
                  {isActive ? (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
                  ) : (
                    <>
                      <span className={cn('text-[10px] font-semibold text-white/30 group-hover:hidden', 'block')}>
                        {index + 1}
                      </span>
                      <svg className="hidden h-3.5 w-3.5 text-white/60 group-hover:block" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </>
                  )}
                </button>

                {/* Type icon */}
                {item.type === 'local-file' ? (
                  <svg className="h-3 w-3 shrink-0 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                ) : (
                  <svg className="h-3 w-3 shrink-0 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                  </svg>
                )}

                {/* Name */}
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[11px]',
                    isActive ? 'font-semibold text-brand' : 'text-white/70',
                  )}
                  title={item.name}
                >
                  {item.name}
                </span>

                {/* Remove */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                  aria-label={t('playlist.remove')}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/20 opacity-0 transition-all hover:bg-white/10 hover:text-white/70 group-hover:opacity-100"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
