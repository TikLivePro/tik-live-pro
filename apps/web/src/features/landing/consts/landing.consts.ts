/** Anchor ids used by the landing nav and section components. */
export const LANDING_SECTION_IDS = {
  features: 'features',
  howItWorks: 'how-it-works',
  pricing: 'pricing',
} as const;

/** Decorative initials for the hero social-proof avatar strip. */
export const SOCIAL_PROOF_AVATARS: { initial: string; colorClass: string }[] = [
  { initial: 'M', colorClass: 'bg-purple-500' },
  { initial: 'K', colorClass: 'bg-sky-500' },
  { initial: 'Z', colorClass: 'bg-amber-500' },
  { initial: 'L', colorClass: 'bg-teal-500' },
  { initial: 'R', colorClass: 'bg-pink-500' },
];

/** Yearly billing discount shown on the pricing toggle. */
export const YEARLY_DISCOUNT_LABEL = '-20%';

export type BillingPeriod = 'monthly' | 'yearly';
