export type UserId = string & { readonly _brand: 'UserId' };
export type Email = string & { readonly _brand: 'Email' };

export const SubscriptionTier = {
  FREE: 'free',
  PREMIUM: 'premium',
} as const;
export type SubscriptionTier = (typeof SubscriptionTier)[keyof typeof SubscriptionTier];

export interface User {
  id: UserId;
  email: Email;
  displayName: string;
  avatarUrl: string | null;
  subscriptionTier: SubscriptionTier;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile extends User {
  socialAccountCount: number;
}
