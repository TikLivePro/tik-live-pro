'use client';

import { useTranslations } from 'next-intl';
import { LegalPageLayout } from './LegalPageLayout';
import { TERMS_SECTION_KEYS } from '../consts/legal.consts';

export function TermsView(): React.JSX.Element {
  const t = useTranslations('legal');

  const sections = TERMS_SECTION_KEYS.map((key) => ({
    id: key,
    title: t(`terms.sections.${key}.title`),
    body: t(`terms.sections.${key}.body`),
  }));

  return (
    <LegalPageLayout
      title={t('terms.title')}
      lastUpdated={t('lastUpdated')}
      summary={t('terms.summary')}
      summaryLabel={t('summaryLabel')}
      sections={sections}
    />
  );
}
