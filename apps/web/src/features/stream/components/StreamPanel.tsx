'use client';

import { useTranslations } from 'next-intl';
import { useStream } from '../hooks/useStream';
import { GoLiveForm } from './GoLiveForm';
import type { SocialAccountId } from '@tik-live-pro/shared-types';

export function StreamPanel(): React.ReactElement {
  const t = useTranslations('stream');
  const { isStarting, goLive } = useStream();

  async function handleGoLive(params: {
    title: string;
    description?: string;
    destinationIds: SocialAccountId[];
  }): Promise<void> {
    await goLive(params);
  }

  return (
    <div className="rounded-xl border border-border bg-background p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold">{t('goLiveHeading')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('goLiveSubtitle')}</p>
      </div>
      <GoLiveForm onSubmit={handleGoLive} isLoading={isStarting} />
    </div>
  );
}
