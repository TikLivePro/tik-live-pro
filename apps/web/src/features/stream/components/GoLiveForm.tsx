'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useSocialAccounts } from '@/features/accounts/hooks/useSocialAccounts';
import { AccountSelector } from './AccountSelector';
import { CameraPreview } from './CameraPreview';
import { cn } from '@/lib/utils';
import type { SocialAccountId } from '@tik-live-pro/shared-types';
import { VIDEO_QUALITY_PRESETS } from '../consts/stream.consts';
import { useStreamStore } from '../store/stream.store';
import type { PreSourceType } from '../store/stream.store';

interface Props {
  onSubmit: (params: { title: string; description?: string; destinationIds: SocialAccountId[] }) => void;
  isLoading: boolean;
}

export function GoLiveForm({ onSubmit, isLoading }: Props): React.ReactElement {
  const t = useTranslations('stream');
  const { data: accounts = [] } = useSocialAccounts();
  const { videoQualityId, setVideoQualityId, hydrateVideoQuality, setPreSource, preSource } = useStreamStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<SocialAccountId>>(new Set());
  const [sourceTab, setSourceTab] = useState<'camera' | PreSourceType>('camera');
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    hydrateVideoQuality();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-select all active accounts once they load
  useEffect(() => {
    if (!initializedRef.current && accounts.length > 0) {
      initializedRef.current = true;
      setSelectedIds(new Set(accounts.filter((a) => a.isActive).map((a) => a.id)));
    }
  }, [accounts]);

  function handleSelectCamera(): void {
    setSourceTab('camera');
    setPreSource(null);
  }

  function handleSelectFile(file: File): void {
    setSourceTab('local-file');
    setPreSource({ type: 'local-file', file });
  }

  function handleLoadUrl(): void {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setSourceTab('online-url');
    setPreSource({ type: 'online-url', url: trimmed });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedDesc = description.trim();
    onSubmit({
      title: title.trim(),
      ...(trimmedDesc ? { description: trimmedDesc } : {}),
      destinationIds: [...selectedIds],
    });
  }

  // Accounts are optional — only the title is required
  const canSubmit = title.trim().length > 0 && !isLoading;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Camera preview */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-muted-foreground">{t('camera.optional')}</p>
        <CameraPreview />
      </div>

      {/* Stream title */}
      <div className="space-y-1.5">
        <label htmlFor="stream-title" className="block text-sm font-medium">
          {t('title')}
        </label>
        <input
          id="stream-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('title')}
          maxLength={120}
          required
          disabled={isLoading}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:opacity-60"
        />
      </div>

      {/* Description — optional */}
      <div className="space-y-1.5">
        <label htmlFor="stream-description" className="block text-sm font-medium text-muted-foreground">
          {t('description')}
        </label>
        <input
          id="stream-description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('description')}
          maxLength={280}
          disabled={isLoading}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:opacity-60"
        />
      </div>

      {/* Quality selector */}
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('quality.streamLabel')}</p>
        <div className="grid grid-cols-3 gap-2">
          {VIDEO_QUALITY_PRESETS.map((preset) => {
            const isSelected = videoQualityId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={isLoading}
                onClick={() => setVideoQualityId(preset.id)}
                className={cn(
                  'flex flex-col items-center rounded-xl border px-2 py-2.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  isSelected
                    ? 'border-brand/60 bg-brand/10 text-brand'
                    : 'border-border bg-background text-foreground hover:border-border/80 hover:bg-muted/50',
                )}
              >
                <span className="text-sm font-semibold">{preset.label}</span>
                <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                  {preset.subLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Account selector — optional */}
      <div className="space-y-2">
        <p className="text-sm font-medium">
          {t('selectAccounts')}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">({t('optionalLabel')})</span>
        </p>
        <AccountSelector
          accounts={accounts}
          selectedIds={selectedIds}
          onChange={setSelectedIds}
        />
        {selectedIds.size === 0 && (
          <p className="text-xs text-muted-foreground">{t('noDestinationsHint')}</p>
        )}
      </div>

      {/* Video source picker */}
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('videoShare.sourcePickerLabel')}</p>
        <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {(['camera', 'local-file', 'online-url'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                if (tab === 'camera') handleSelectCamera();
                else if (tab === 'local-file') fileInputRef.current?.click();
                else setSourceTab('online-url');
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors',
                sourceTab === tab
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab === 'camera' && (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
              )}
              {tab === 'local-file' && (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
              )}
              {tab === 'online-url' && (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                </svg>
              )}
              {t(tab === 'camera' ? 'videoShare.camera' : tab === 'local-file' ? 'videoShare.localFile' : 'videoShare.onlineUrl')}
            </button>
          ))}
        </div>

        {/* File input (hidden) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleSelectFile(file);
            e.target.value = '';
          }}
        />

        {/* URL input */}
        {sourceTab === 'online-url' && (
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLoadUrl(); } }}
              placeholder={t('videoShare.urlPlaceholder')}
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
            <button
              type="button"
              onClick={handleLoadUrl}
              disabled={!urlInput.trim()}
              className="rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-sm font-semibold text-brand transition-opacity disabled:opacity-40 hover:bg-brand/20"
            >
              {t('videoShare.loadUrl')}
            </button>
          </div>
        )}

        {/* Confirmation label for local file */}
        {sourceTab === 'local-file' && preSource?.file && (
          <p className="truncate text-xs text-muted-foreground">
            ✓ <span className="font-medium text-foreground">{preSource.file.name}</span>
          </p>
        )}
        {sourceTab === 'online-url' && urlInput.trim() && (
          <p className="truncate text-xs text-muted-foreground">
            URL: <span className="font-medium text-foreground">{urlInput.trim()}</span>
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-colors',
          'bg-brand hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {isLoading && (
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
        )}
        {isLoading ? t('status.starting') : t('goLive')}
      </button>
    </form>
  );
}
