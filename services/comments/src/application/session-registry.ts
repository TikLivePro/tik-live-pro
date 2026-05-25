import type { LiveSessionId, SocialAccountId, SocialPlatform } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';

export interface SessionAccount {
  socialAccountId: SocialAccountId;
  platform: SocialPlatform;
}

export class SessionRegistry {
  private readonly sessions = new Map<string, SessionAccount[]>();

  constructor(private readonly logger: Logger) {}

  register(sessionId: LiveSessionId, accounts: SessionAccount[]): void {
    this.sessions.set(sessionId, accounts);
    this.logger.debug({ sessionId, accountCount: accounts.length }, 'Session registered');
  }

  remove(sessionId: LiveSessionId): void {
    this.sessions.delete(sessionId);
    this.logger.debug({ sessionId }, 'Session removed from registry');
  }

  getAccounts(sessionId: LiveSessionId): SessionAccount[] {
    return this.sessions.get(sessionId) ?? [];
  }

  getAccountForPlatform(sessionId: LiveSessionId, platform: SocialPlatform): SessionAccount | null {
    return this.sessions.get(sessionId)?.find((a) => a.platform === platform) ?? null;
  }
}
