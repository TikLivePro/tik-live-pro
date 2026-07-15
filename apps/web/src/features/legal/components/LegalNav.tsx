'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeftIcon } from './LegalIcons';

/** Slim sticky nav shared by the legal document + data deletion pages: wordmark + back link only. */
export function LegalNav(): React.JSX.Element {
  const t = useTranslations('legal');

  return (
    <header className="glass-header sticky top-0 z-10 border-b border-border/50">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <span className="text-gradient-brand text-display text-lg font-extrabold">TikLivePro</span>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="h-4 w-4 shrink-0" />
          {t('backHome')}
        </Link>
      </div>
    </header>
  );
}
