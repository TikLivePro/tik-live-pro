'use client';

import { useTranslations } from 'next-intl';
import { LegalPageLayout } from './LegalPageLayout';
import { PRIVACY_SECTION_KEYS } from '../consts/legal.consts';

export function PrivacyView(): React.JSX.Element {
  const t = useTranslations('legal');

  const sections = PRIVACY_SECTION_KEYS.map((key) => ({
    id: key,
    title: t(`privacy.sections.${key}.title`),
    body: t(`privacy.sections.${key}.body`),
  }));

  return (
    <LegalPageLayout
      title={t('privacy.title')}
      lastUpdated={t('lastUpdated')}
      summary={t('privacy.summary')}
      summaryLabel={t('summaryLabel')}
      sections={sections}
    />
  );
}
