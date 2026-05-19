import type { ITokenProvider, AccountToken } from '../../application/ports/token-provider.port.js';
import type { SocialAccountId, SocialPlatform } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';

export class IntegrationsTokenProvider implements ITokenProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly logger: Logger,
  ) {}

  async getToken(socialAccountId: SocialAccountId): Promise<AccountToken> {
    const url = `${this.baseUrl}/internal/accounts/${socialAccountId}/token`;

    const response = await fetch(url, {
      headers: { 'x-internal-service': 'stream-orchestrator' },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get token for account ${socialAccountId}: ${response.status} ${text}`);
    }

    const data = await response.json() as {
      accessToken: string;
      platform: string;
      platformUserId: string;
    };

    this.logger.debug({ socialAccountId, platform: data.platform }, 'Token resolved');

    return {
      accessToken: data.accessToken,
      platform: data.platform as SocialPlatform,
      platformUserId: data.platformUserId,
    };
  }
}
