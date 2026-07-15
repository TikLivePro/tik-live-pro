'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LEGAL_FOOTER_LINKS } from '../consts/legal.consts';

/** Slim footer shared by the legal document + data deletion pages. */
export function LegalFooter(): React.JSX.Element {
  const t = useTranslations('landing.footer');

  return (
    <footer className="mt-auto w-full border-t border-border/50 bg-card/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <p className="text-xs text-muted-foreground">{t('rights')}</p>
        <nav className="flex flex-wrap justify-center gap-5">
          {LEGAL_FOOTER_LINKS.map(({ href, labelKey }) => (
            <Link
              key={href}
              href={href}
              className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t(labelKey)}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
