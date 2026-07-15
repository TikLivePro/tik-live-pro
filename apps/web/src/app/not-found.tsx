'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/features/auth/store/auth.store';

export default function NotFound(): React.ReactElement {
  const t = useTranslations('notFound');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface-0 px-6 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 30%, hsl(var(--brand) / 0.1) 0%, transparent 70%)',
        }}
      />

      <div className="glass-overlay relative z-10 flex w-full max-w-md flex-col items-center gap-5 rounded-card p-10">
        <div className="relative mb-2 flex h-24 w-24 items-center justify-center">
          <span
            aria-hidden="true"
            className="text-gradient-brand absolute inset-0 flex items-center justify-center text-7xl font-black opacity-20"
          >
            404
          </span>
          <div className="animate-float-gentle">
            <svg
              className="h-14 w-14 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 8l6-4v16l-6-4" />
              <rect x="1" y="6" width="14" height="12" rx="2" />
              <line x1="1" y1="6" x2="15" y2="18" />
            </svg>
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-4 border-surface-0 bg-destructive">
            <svg className="h-3 w-3 text-white" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        </div>

        <h1 className="text-xl font-bold text-foreground">{t('heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('message')}</p>

        <Link
          href={isAuthenticated ? '/dashboard' : '/'}
          className="btn-gradient mt-2 px-6 py-2.5 text-sm font-semibold"
        >
          {isAuthenticated ? t('goDashboard') : t('goHome')}
        </Link>
      </div>

      <div className="relative z-10 mt-10 flex items-center gap-3">
        <div className="h-px w-12 bg-border" />
        <p className="text-[11px] font-medium text-muted-foreground/50">tiklivepro.me</p>
        <div className="h-px w-12 bg-border" />
      </div>
    </div>
  );
}
