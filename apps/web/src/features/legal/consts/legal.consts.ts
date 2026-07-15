import type { DataDeletionChecklistKey, DataDeletionReasonValue } from '../interfaces/legal.interfaces';

/** Ordered section keys rendered in the Privacy Policy prose + TOC. */
export const PRIVACY_SECTION_KEYS = [
  'intro',
  'collect',
  'use',
  'sharing',
  'retention',
  'rights',
  'cookies',
  'security',
  'changes',
  'contact',
] as const;

/** Ordered section keys rendered in the Terms of Service prose + TOC. */
export const TERMS_SECTION_KEYS = [
  'acceptance',
  'description',
  'eligibility',
  'account',
  'acceptable',
  'thirdParty',
  'billing',
  'ip',
  'liability',
  'termination',
  'changes',
  'contact',
] as const;

/** Footer legal links — labels come from `landing.footer` (shared with the landing/auth footers). */
export const LEGAL_FOOTER_LINKS: { href: string; labelKey: 'privacy' | 'terms' | 'dataDeletion' }[] = [
  { href: '/legal/privacy', labelKey: 'privacy' },
  { href: '/legal/terms', labelKey: 'terms' },
  { href: '/data-deletion', labelKey: 'dataDeletion' },
];

/** The 4-item "what gets deleted" checklist on the Data Deletion page. */
export const DATA_DELETION_CHECKLIST_ITEMS: DataDeletionChecklistKey[] = [
  'account',
  'socialTokens',
  'streamHistory',
  'recordings',
];

/** Optional reason options for the deletion request select. */
export const DATA_DELETION_REASONS: DataDeletionReasonValue[] = [
  'privacy',
  'switching',
  'quitting',
  'technical',
  'other',
];

/**
 * Support inbox the manual deletion request is addressed to. There is no
 * backend "deletion request" endpoint (only the Facebook signed-request
 * webhook is wired end-to-end, see `app/api/auth/facebook/deletion/route.ts`)
 * — the manual form composes a real `mailto:` request instead of faking a
 * server round-trip.
 */
export const DATA_DELETION_SUPPORT_EMAIL = 'support@tiklivepro.me';
