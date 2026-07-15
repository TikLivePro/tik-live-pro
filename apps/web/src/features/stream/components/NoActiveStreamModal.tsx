'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

interface Props {
  open: boolean;
  onClose: () => void;
  onGoToDashboard: () => void;
}

/** Informational modal shown when the "Streaming" nav item is clicked but no session is live. */
export function NoActiveStreamModal({ open, onClose, onGoToDashboard }: Props): React.ReactElement | null {
  const t = useTranslations('stream.controlRoom.sidebar.notLiveModal');

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return (): void => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="no-active-stream-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label={t('close')}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="glass-overlay relative w-full max-w-sm rounded-card p-6 shadow-2xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-brand">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        </div>
        <h2 id="no-active-stream-title" className="text-display text-lg font-semibold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('body')}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm font-medium">
            {t('close')}
          </button>
          <button
            type="button"
            onClick={onGoToDashboard}
            className="btn-gradient rounded-full px-4 py-2 text-sm font-semibold"
          >
            {t('cta')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
