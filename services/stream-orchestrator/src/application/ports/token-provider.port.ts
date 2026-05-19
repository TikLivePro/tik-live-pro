import type { SocialAccountId, SocialPlatform } from '@tik-live-pro/shared-types';

export interface AccountToken {
  accessToken: string;
  platform: SocialPlatform;
  platformUserId: string;
}

export interface ITokenProvider {
  getToken(socialAccountId: SocialAccountId): Promise<AccountToken>;
}
