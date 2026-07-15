'use client';

import { useTranslations } from 'next-intl';
import { ShieldIcon } from './LegalIcons';
import { LegalCallout } from './LegalCallout';
import { DataDeletionChecklist } from './DataDeletionChecklist';
import { DataDeletionForm } from './DataDeletionForm';

interface DataDeletionCardProps {
  email: string;
  reason: string;
  setEmail: (value: string) => void;
  setReason: (value: string) => void;
  onSubmit: () => void;
}

/** Centered card: icon, title, deletion checklist, grace-period note, and the request form. */
export function DataDeletionCard({ email, reason, setEmail, setReason, onSubmit }: DataDeletionCardProps): React.JSX.Element {
  const t = useTranslations('legal.dataDeletion');

  return (
    <div className="card-surface p-6 shadow-2xl md:p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldIcon className="h-7 w-7" />
        </div>
        <h1 className="text-display text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="mb-6 space-y-3">
        <DataDeletionChecklist />
        <LegalCallout variant="note">{t('gracePeriodNote')}</LegalCallout>
      </div>

      <DataDeletionForm email={email} reason={reason} setEmail={setEmail} setReason={setReason} onSubmit={onSubmit} />
    </div>
  );
}
