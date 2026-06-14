import type { AdapterRegistry } from '@tik-live-pro/platform-adapters';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { Comment, LiveSessionId, SocialAccountId, SocialPlatform } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';
import type { SessionRegistry } from './session-registry.js';

interface TokenInfo {
  accessToken: string;
  platform: string;
  platformUserId: string;
}

export class CommentPoster {
  constructor(
    private readonly adapterRegistry: AdapterRegistry,
    private readonly sessionRegistry: SessionRegistry,
    private readonly nats: NatsJetStreamClient,
    private readonly logger: Logger,
    private readonly integrationsUrl: string,
    private readonly internalApiKey: string,
  ) {}

  async postToAllPlatforms(sessionId: LiveSessionId, content: string): Promise<Comment[]> {
    const accounts = this.sessionRegistry.getAccounts(sessionId);
    if (accounts.length === 0) {
      this.logger.warn({ sessionId }, 'No accounts registered for session, cannot post comment');
      return [];
    }

    const tokenMap = await this.fetchTokens(accounts.map((a) => a.socialAccountId));
    const posted: Comment[] = [];

    for (const account of accounts) {
      const tokenInfo = tokenMap[account.socialAccountId];
      if (!tokenInfo) continue;

      const platform = tokenInfo.platform as SocialPlatform;
      try {
        const adapter = this.adapterRegistry.get(platform);
        const comment = await adapter.postComment(
          tokenInfo.accessToken,
          sessionId,
          account.socialAccountId,
          content,
        );
        posted.push(comment);
        await this.nats.publish(Subjects.COMMENT_POSTED, {
          sessionId,
          platform,
          socialAccountId: account.socialAccountId,
          content,
          platformCommentId: comment.platformCommentId,
        });
      } catch (err) {
        this.logger.error({ err, sessionId, platform }, 'Failed to post comment to platform');
      }
    }

    return posted;
  }

  async replyToPlatformComment(
    sessionId: LiveSessionId,
    platform: SocialPlatform,
    parentCommentId: string,
    parentPlatformCommentId: string,
    parentAuthorPlatformUserId: string,
    content: string,
  ): Promise<Comment | null> {
    const accounts = this.sessionRegistry.getAccounts(sessionId);
    if (accounts.length === 0) {
      this.logger.warn({ sessionId, platform }, 'No accounts registered for session, cannot reply');
      return null;
    }

    // Registry may store 'unknown' platform (session.created carries only account IDs).
    // Resolve authoritative platform info from the integrations service via token fetch.
    const tokenMap = await this.fetchTokens(accounts.map((a) => a.socialAccountId));
    const matchingEntry = Object.entries(tokenMap).find(([, info]) => info.platform === platform);
    if (!matchingEntry) {
      this.logger.warn({ sessionId, platform }, 'No account for platform, cannot reply');
      return null;
    }
    const [accountId, tokenInfo] = matchingEntry;

    const adapter = this.adapterRegistry.get(platform);
    const comment = await adapter.replyToComment(
      tokenInfo.accessToken,
      sessionId,
      accountId as SocialAccountId,
      parentPlatformCommentId,
      parentAuthorPlatformUserId,
      content,
    );

    await this.nats.publish(Subjects.COMMENT_REPLIED, {
      sessionId,
      platform,
      socialAccountId: accountId as SocialAccountId,
      content,
      platformCommentId: comment.platformCommentId,
      replyToCommentId: parentCommentId,
      replyToPlatformCommentId: parentPlatformCommentId,
    });

    return comment;
  }

  private async fetchTokens(
    accountIds: string[],
  ): Promise<Record<string, TokenInfo>> {
    try {
      const response = await fetch(`${this.integrationsUrl}/internal/accounts/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': this.internalApiKey,
        },
        body: JSON.stringify({ accountIds }),
      });

      if (!response.ok) {
        this.logger.error({ status: response.status }, 'Failed to fetch tokens from integrations service');
        return {};
      }

      const json = await response.json() as { data: Record<string, TokenInfo> };
      return json.data;
    } catch (err) {
      this.logger.error({ err }, 'Error calling integrations service for tokens');
      return {};
    }
  }
}
