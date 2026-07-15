export { AVATAR_COLORS } from '@/lib/avatar.consts';

/** Display-only mirror of the billing freemium limit (authoritative check lives in the billing service). */
export const FREE_PLAN_MAX_ACCOUNTS = 2;

/**
 * Static permission-scope summary per platform, as i18n key suffixes under
 * `accounts.page.scopes.*` — OAuth scopes aren't exposed client-side.
 */
export const PLATFORM_PERMISSION_SCOPES: Record<'tiktok' | 'facebook', readonly string[]> = {
  tiktok: ['liveVideo', 'comments', 'profileInfo'],
  facebook: ['liveVideo', 'pages', 'comments'],
};
