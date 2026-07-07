import type { OAuthProvider } from '../interfaces/auth.interfaces';

export const OAUTH_PROVIDERS: OAuthProvider[] = ['google', 'facebook', 'tiktok'];

/**
 * Per-provider button styling — platform identity colors are allowed on the
 * provider's own button (Pro-Stream rule: identity colors never on CTAs).
 */
export const SOCIAL_BUTTON_CLASSES: Record<OAuthProvider, string> = {
  tiktok: 'bg-black text-white border border-white/15 hover:bg-black/85',
  facebook: 'bg-[#1877F2] text-white border border-transparent hover:bg-[#1668d3]',
  google: 'bg-card text-foreground border border-border hover:bg-muted/40',
};

/**
 * sessionStorage key remembering the provider of the in-flight OAuth attempt,
 * so the social-callback failure state can offer a real "Try again".
 */
export const LAST_OAUTH_PROVIDER_STORAGE_KEY = 'tlp.lastOAuthProvider';

/** Legal links shown in the auth page footer (labels from `landing.footer`). */
export const AUTH_LEGAL_LINKS: { href: string; labelKey: 'terms' | 'privacy' }[] = [
  { href: '/legal/terms', labelKey: 'terms' },
  { href: '/legal/privacy', labelKey: 'privacy' },
];
