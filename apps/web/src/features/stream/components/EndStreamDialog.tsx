'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  open: boolean;
  isEnding: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation dialog shown before ending a live stream on every destination. */
export function EndStreamDialog({ open, isEnding, onCancel, onConfirm }: Props): React.ReactElement | null {
  const t = useTranslations('stream.controlRoom');
  const tCommon = useTranslations('common');

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="end-stream-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label={tCommon('cancel')}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="glass-overlay relative w-full max-w-sm rounded-card p-6 shadow-2xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-500/15 text-red-500">
          <span className="h-3.5 w-3.5 rounded-[3px] border-2 border-current" />
        </div>
        <h2 id="end-stream-title" className="text-display text-lg font-semibold text-foreground">
          {t('endConfirmTitle')}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('endConfirmBody')}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-ghost px-4 py-2 text-sm font-medium"
          >
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isEnding}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEnding && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {t('endConfirmAction')}
          </button>
        </div>
      </div>
    </div>
  );
}
