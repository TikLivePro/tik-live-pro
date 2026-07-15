'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LegalNav } from './LegalNav';
import { LegalFooter } from './LegalFooter';
import { DataDeletionCard } from './DataDeletionCard';
import { DataDeletionConfirmDialog } from './DataDeletionConfirmDialog';
import { DataDeletionSuccess } from './DataDeletionSuccess';
import { useDataDeletionRequest } from '../hooks/useDataDeletionRequest';
import { DATA_DELETION_SUPPORT_EMAIL } from '../consts/legal.consts';

interface DataDeletionViewProps {
  /** Present when reached via the Facebook signed-request webhook redirect (`?code=`). */
  facebookCode?: string | undefined;
}

export function DataDeletionView({ facebookCode }: DataDeletionViewProps): React.JSX.Element {
  const t = useTranslations('legal.dataDeletion');
  const tPrivacy = useTranslations('legal.privacy');
  const deletion = useDataDeletionRequest();

  const showSuccess = Boolean(facebookCode) || deletion.status === 'success';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LegalNav />

      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-4 py-16 sm:px-6 md:py-24">
        {showSuccess ? (
          <DataDeletionSuccess
            variant={facebookCode ? 'facebook' : 'manual'}
            referenceId={facebookCode ?? deletion.referenceId ?? ''}
          />
        ) : (
          <DataDeletionCard
            email={deletion.email}
            reason={deletion.reason}
            setEmail={deletion.setEmail}
            setReason={deletion.setReason}
            onSubmit={deletion.openConfirm}
          />
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/legal/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
            {tPrivacy('title')}
          </Link>
          {' · '}
          <a
            href={`mailto:${DATA_DELETION_SUPPORT_EMAIL}`}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {t('contactSupport')}
          </a>
        </p>
      </main>

      <LegalFooter />

      <DataDeletionConfirmDialog
        open={deletion.status === 'confirming'}
        onCancel={deletion.closeConfirm}
        onConfirm={deletion.confirmRequest}
      />
    </div>
  );
}
