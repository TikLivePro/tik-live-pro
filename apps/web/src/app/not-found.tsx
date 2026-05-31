import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound(): Promise<React.ReactElement> {
  const t = await getTranslations('notFound');

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 text-center">
      {/* Ambient glow behind the 404 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 30%, hsl(4 82% 55% / 0.07) 0%, transparent 70%)',
        }}
      />

      {/* Brand mark */}
      <div className="relative z-10 mb-8 flex items-center gap-2">
        <svg className="h-6 w-6" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="hsl(4 82% 55%)" />
          <path
            d="M10 22V10l12 12V10"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-base font-bold tracking-tight text-foreground">TikLivePro</span>
      </div>

      {/* 404 numeral */}
      <p
        className="relative z-10 select-none text-[8rem] font-black leading-none tracking-tighter text-brand sm:text-[11rem]"
        aria-hidden="true"
      >
        404
      </p>

      {/* Heading + message */}
      <div className="relative z-10 mt-4 space-y-2">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{t('heading')}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t('message')}</p>
      </div>

      {/* CTA */}
      <Link
        href="/auth/login"
        className="relative z-10 mt-8 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
      >
        <svg
          className="h-4 w-4 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        {t('goHome')}
      </Link>

      {/* Divider line */}
      <div className="relative z-10 mt-16 flex items-center gap-3">
        <div className="h-px w-12 bg-border" />
        <p className="text-[11px] font-medium text-muted-foreground/50">tiklivepro.me</p>
        <div className="h-px w-12 bg-border" />
      </div>
    </div>
  );
}
