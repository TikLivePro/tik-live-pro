'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDeleteAccount } from '../hooks/useDeleteAccount';

interface DeleteAccountModalProps {
  open: boolean;
  onClose: () => void;
}

/** Type-to-confirm destructive modal wired to DELETE /users/me. */
export function DeleteAccountModal({ open, onClose }: DeleteAccountModalProps): React.JSX.Element | null {
  const t = useTranslations('settings.security.danger');
  const tCommon = useTranslations('common');
  const [confirmText, setConfirmText] = useState('');
  const { mutate: deleteAccount, isPending } = useDeleteAccount();

  const confirmWord = t('confirmWord');
  const canDelete = confirmText.trim() === confirmWord && !isPending;

  useEffect(() => {
    if (!open) return;
    setConfirmText('');
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label={tCommon('cancel')}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="glass-overlay relative w-full max-w-md rounded-card p-6 shadow-2xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </div>

        <h2 id="delete-account-title" className="text-display text-lg font-semibold text-foreground">
          {t('confirmTitle')}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('confirmDescription')}</p>

        <label htmlFor="delete-confirm-input" className="mt-4 block text-xs font-semibold text-muted-foreground">
          {t('confirmLabel', { word: confirmWord })}
        </label>
        <input
          id="delete-confirm-input"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="mt-1.5 w-full rounded-xl border border-destructive/40 bg-input px-3.5 py-2.5 text-sm transition-colors placeholder:text-muted-foreground"
          placeholder={confirmWord}
        />

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm font-medium">
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={() => deleteAccount()}
            disabled={!canDelete}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {isPending ? t('deleting') : t('confirmCta')}
          </button>
        </div>
      </div>
    </div>
  );
}
