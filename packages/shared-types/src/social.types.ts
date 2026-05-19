export const SocialPlatform = {
  TIKTOK: 'tiktok',
  FACEBOOK: 'facebook',
} as const;
export type SocialPlatform = (typeof SocialPlatform)[keyof typeof SocialPlatform];

export type SocialAccountId = string & { readonly _brand: 'SocialAccountId' };

export interface SocialAccount {
  id: SocialAccountId;
  userId: string;
  platform: SocialPlatform;
  platformUserId: string;
  displayName: string;
  avatarUrl: string | null;
  isActive: boolean;
  connectedAt: Date;
}

export interface PlatformStreamDestination {
  socialAccountId: SocialAccountId;
  platform: SocialPlatform;
  streamKey: string;
  rtmpUrl: string;
  status: DestinationStatus;
}

export const DestinationStatus = {
  PENDING: 'pending',
  CONNECTING: 'connecting',
  LIVE: 'live',
  ERROR: 'error',
  ENDED: 'ended',
} as const;
export type DestinationStatus = (typeof DestinationStatus)[keyof typeof DestinationStatus];
