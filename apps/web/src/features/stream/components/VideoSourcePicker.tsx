'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { VideoSourceType } from '../interfaces/video-share.interfaces';

interface Props {
  sourceType: VideoSourceType;
  onSelectCamera: () => void;
  onSelectLocalFile: (file: File) => void;
  onSelectOnlineUrl: (url: string) => void;
}

export function VideoSourcePicker({
  sourceType,
  onSelectCamera,
  onSelectLocalFile,
  onSelectOnlineUrl,
}: Props): React.ReactElement {
  const t = useTranslations('stream');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [pendingTab, setPendingTab] = useState<VideoSourceType>(sourceType);

  function handleTabClick(tab: VideoSourceType): void {
    setPendingTab(tab);
    if (tab === 'camera') onSelectCamera();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) onSelectLocalFile(file);
    // Reset so re-selecting same file fires onChange again
    e.target.value = '';
  }

  function handleLoadUrl(): void {
    const trimmed = urlInput.trim();
    if (trimmed) onSelectOnlineUrl(trimmed);
  }

  const tabBase =
    'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors';
  const tabActive = 'bg-white/15 text-white';
  const tabInactive = 'text-white/40 hover:text-white/70';

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
      {/* Source tabs */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleTabClick('camera')}
          className={cn(tabBase, pendingTab === 'camera' ? tabActive : tabInactive)}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          {t('videoShare.camera')}
        </button>

        <button
          type="button"
          onClick={() => handleTabClick('local-file')}
          className={cn(tabBase, pendingTab === 'local-file' ? tabActive : tabInactive)}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          {t('videoShare.localFile')}
        </button>

        <button
          type="button"
          onClick={() => handleTabClick('online-url')}
          className={cn(tabBase, pendingTab === 'online-url' ? tabActive : tabInactive)}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
          </svg>
          {t('videoShare.onlineUrl')}
        </button>
      </div>

      {/* Contextual input */}
      {pendingTab === 'local-file' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileChange}
          />
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
    </div>
  );
}
