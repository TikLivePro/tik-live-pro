'use client';

import { useTranslations } from 'next-intl';
import { useSocialCallback } from '../hooks/useSocialCallback';
import { AlertTriangleIcon } from './AuthIcons';

export function SocialCallbackView(): React.JSX.Element {
  const t = useTranslations('auth.callback');
  const { state, retry, backToLogin } = useSocialCallback();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="bg-grid-dots absolute inset-0" />
        <div className="animate-orb-drift absolute -bottom-40 -right-32 h-[420px] w-[420px] rounded-full bg-brand/15 blur-[120px]" />
        <div className="animate-orb-drift absolute -top-32 -left-24 h-[360px] w-[360px] rounded-full bg-brand-end/10 blur-[110px] [animation-delay:-7s]" />
      </div>

      <span className="bg-gradient-brand relative mb-10 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
        TikLivePro
      </span>

      <div className="card-surface animate-fade-up relative w-full max-w-md p-8 text-center sm:p-10">
        {state === 'connecting' ? (
          <>
            <div className="spinner-brand mx-auto h-12 w-12 animate-spin" role="status" aria-label={t('connecting')} />
            <h1 className="text-display mt-6 text-lg font-bold text-foreground">{t('connecting')}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{t('redirectMoment')}</p>
          </>
        ) : (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15">
              <AlertTriangleIcon className="h-5 w-5 text-destructive" />
            </span>
            <h1 className="text-display mt-6 text-lg font-bold text-foreground">{t('failedTitle')}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t('failedBody')}</p>
            <button
              type="button"
              onClick={retry}
              className="btn-gradient mt-6 w-full px-4 py-2.5 text-sm font-semibold"
            >
              {t('tryAgain')}
            </button>
            <button
              type="button"
              onClick={backToLogin}
              className="btn-ghost mt-3 w-full px-4 py-2.5 text-sm font-medium"
            >
              {t('backToLogin')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
