import type { SocialPlatform, Comment, SocialAccountId, LiveSessionId } from '@tik-live-pro/shared-types';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
}

export interface StreamTarget {
  rtmpUrl: string;
  streamKey: string;
  expiresAt: Date | null;
  platformStreamId?: string;
}

export interface PlatformUser {
  platformUserId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommentPage {
  comments: Comment[];
  nextCursor: string | null;
}

/**
 * Contract every platform adapter must implement.
 * Add a new platform by creating a class that satisfies this interface
 * — no changes to any core service are required.
 */
export interface IPlatformAdapter {
  readonly platform: SocialPlatform;

  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  refreshTokens(refreshToken: string): Promise<OAuthTokens>;
  revokeTokens(accessToken: string): Promise<void>;
  getUser(accessToken: string): Promise<PlatformUser>;

  createLiveStream(
    accessToken: string,
    title: string,
    description: string | null,
  ): Promise<StreamTarget>;

  endLiveStream(accessToken: string, streamId: string): Promise<void>;

  pollComments(
    accessToken: string,
    sessionId: LiveSessionId,
    socialAccountId: SocialAccountId,
    cursor: string | null,
  ): Promise<CommentPage>;

  postComment(
    accessToken: string,
    sessionId: LiveSessionId,
    socialAccountId: SocialAccountId,
    content: string,
  ): Promise<Comment>;

  replyToComment(
    accessToken: string,
    sessionId: LiveSessionId,
    socialAccountId: SocialAccountId,
    parentPlatformCommentId: string,
    parentAuthorPlatformUserId: string,
    content: string,
  ): Promise<Comment>;
}
