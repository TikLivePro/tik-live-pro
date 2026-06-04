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

interface Props {
  onSubmit: (params: { title: string; description?: string; destinationIds: SocialAccountId[] }) => void;
  isLoading: boolean;
}

export function GoLiveForm({ onSubmit, isLoading }: Props): React.ReactElement {
  const t = useTranslations('stream');
  const { data: accounts = [] } = useSocialAccounts();
  const { videoQualityId, setVideoQualityId } = useStreamStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<SocialAccountId>>(new Set());
  const initializedRef = useRef(false);

  // Pre-select all active accounts once they load
  useEffect(() => {
    if (!initializedRef.current && accounts.length > 0) {
      initializedRef.current = true;
      setSelectedIds(new Set(accounts.filter((a) => a.isActive).map((a) => a.id)));
    }
  }, [accounts]);

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
        <p className="text-sm font-medium">{t('quality.label')}</p>
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
