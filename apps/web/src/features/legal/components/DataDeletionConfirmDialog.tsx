'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldIcon } from './LegalIcons';

interface DataDeletionConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirm step before the deletion request email is composed. */
export function DataDeletionConfirmDialog({ open, onCancel, onConfirm }: DataDeletionConfirmDialogProps): React.JSX.Element | null {
  const t = useTranslations('legal.dataDeletion.confirm');
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
      aria-labelledby="deletion-confirm-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label={tCommon('cancel')}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="glass-overlay relative w-full max-w-sm rounded-card p-6 shadow-2xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <ShieldIcon className="h-5 w-5" />
        </div>
        <h2 id="deletion-confirm-title" className="text-display text-lg font-semibold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('description')}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost px-4 py-2 text-sm font-medium">
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            {t('cta')}
          </button>
        </div>
      </div>
    </div>
  );
}
