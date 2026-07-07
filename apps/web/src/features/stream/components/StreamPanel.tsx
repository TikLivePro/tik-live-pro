'use client';

import { useTranslations } from 'next-intl';
import { useStream } from '../hooks/useStream';
import { GoLiveForm } from './GoLiveForm';
import { GO_LIVE_FORM_ID } from '../consts/stream.consts';
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
    <div id={GO_LIVE_FORM_ID} className="card-surface scroll-mt-20 p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight">{t('goLiveHeading')}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('goLiveSubtitle')}</p>
      </div>
      <GoLiveForm onSubmit={handleGoLive} isLoading={isStarting} />
    </div>
  );
}
