'use client';

import { useTranslations } from 'next-intl';
import { DATA_DELETION_REASONS } from '../consts/legal.consts';

interface DataDeletionFormProps {
  email: string;
  reason: string;
  setEmail: (value: string) => void;
  setReason: (value: string) => void;
  onSubmit: () => void;
}

/** Email + optional reason fields for the manual deletion request. */
export function DataDeletionForm({ email, reason, setEmail, setReason, onSubmit }: DataDeletionFormProps): React.JSX.Element {
  const t = useTranslations('legal.dataDeletion.form');

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="deletion-email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('emailLabel')}
        </label>
        <input
          id="deletion-email"
          type="email"
          required
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-[var(--input-border-color)] bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="deletion-reason" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('reasonLabel')}
        </label>
        <select
          id="deletion-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-[var(--input-border-color)] bg-input px-3.5 py-2.5 text-sm text-foreground"
        >
          <option value="">{t('reasonPlaceholder')}</option>
          {DATA_DELETION_REASONS.map((value) => (
            <option key={value} value={value}>
              {t(`reasons.${value}`)}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn-gradient h-12 w-full text-sm font-bold">
        {t('submit')}
      </button>
    </form>
  );
}
