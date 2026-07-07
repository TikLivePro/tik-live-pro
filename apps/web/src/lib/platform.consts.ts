/**
 * Pro-Stream Aesthetic — platform identity colors.
 * Used for chips, badges and accents only — never for CTAs
 * (CTAs always use the brand gradient, see --brand-gradient in globals.css).
 */
export const PLATFORM_IDENTITY_COLORS = {
  tiktok: '#25F4EE',
  facebook: '#1877F2',
} as const;

export type PlatformId = keyof typeof PLATFORM_IDENTITY_COLORS;

export function getPlatformIdentityColor(platform: string): string | undefined {
  return PLATFORM_IDENTITY_COLORS[platform as PlatformId];
}
