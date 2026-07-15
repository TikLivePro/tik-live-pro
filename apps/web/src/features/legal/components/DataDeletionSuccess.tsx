import { useTranslations } from 'next-intl';
import { CheckCircleIcon } from './LegalIcons';

interface DataDeletionSuccessProps {
  /** `facebook` = arrived via the automated Meta signed-request webhook; `manual` = the self-service form. */
  variant: 'facebook' | 'manual';
  referenceId: string;
}

/** Success state shown after a deletion request has been received or drafted. */
export function DataDeletionSuccess({ variant, referenceId }: DataDeletionSuccessProps): React.JSX.Element {
  const t = useTranslations('legal.dataDeletion.success');

  return (
    <div className="card-surface animate-scale-in flex flex-col items-center p-8 text-center shadow-2xl">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
        <CheckCircleIcon className="h-6 w-6" />
      </div>
      <h1 className="text-display text-xl font-semibold text-foreground">
        {variant === 'facebook' ? t('facebookTitle') : t('manualTitle')}
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {variant === 'facebook' ? t('facebookDescription') : t('manualDescription')}
      </p>
      <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('referenceLabel')}
        </span>
        <span className="font-mono text-xs font-semibold text-brand">{referenceId}</span>
      </div>
      {variant === 'manual' && <p className="mt-4 text-xs text-muted-foreground">{t('confirmationNote')}</p>}
    </div>
  );
}
