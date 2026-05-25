import type { IPlatformAdapter, OAuthTokens, StreamTarget, PlatformUser, CommentPage } from '../../interface/platform-adapter.interface.js';
import type { Comment, LiveSessionId, SocialAccountId } from '@tik-live-pro/shared-types';
import { SocialPlatform } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';
import { randomUUID } from 'node:crypto';

export interface TikTokAdapterConfig {
  clientKey: string;
  clientSecret: string;
  baseUrl?: string;
}

export class TikTokAdapter implements IPlatformAdapter {
  readonly platform = SocialPlatform.TIKTOK;

  private readonly baseUrl: string;

  constructor(
    private readonly config: TikTokAdapterConfig,
    private readonly logger: Logger,
  ) {
    this.baseUrl = config.baseUrl ?? 'https://open.tiktokapis.com/v2';
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    this.logger.debug({ code: code.slice(0, 8), redirectUri }, 'TikTok: exchanging auth code');

    const response = await fetch(`${this.baseUrl}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: this.config.clientKey,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error({ status: response.status, body: text }, 'TikTok: token exchange failed');
      throw new Error(`TikTok token exchange failed: ${text}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    this.logger.info({ expiresAt }, 'TikTok: auth code exchanged successfully');

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      scope: data.scope,
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    this.logger.debug('TikTok: refreshing tokens');
    const response = await fetch(`${this.baseUrl}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: this.config.clientKey,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      this.logger.warn({ status: response.status }, 'TikTok: token refresh failed');
      throw new Error('TikTok token refresh failed');
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    this.logger.info({ expiresAt }, 'TikTok: tokens refreshed');
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      scope: data.scope,
    };
  }

  async revokeTokens(accessToken: string): Promise<void> {
    this.logger.debug('TikTok: revoking tokens');
    await fetch(`${this.baseUrl}/oauth/revoke/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    this.logger.info('TikTok: tokens revoked');
  }

  async getUser(accessToken: string): Promise<PlatformUser> {
    this.logger.debug('TikTok: fetching user info');
    const response = await fetch(
      `${this.baseUrl}/user/info/?fields=open_id,display_name,avatar_url`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      this.logger.error({ status: response.status }, 'TikTok: failed to fetch user');
      throw new Error('Failed to fetch TikTok user');
    }

    const data = await response.json() as {
      data: { user: { open_id: string; display_name: string; avatar_url: string } };
    };

    this.logger.debug({ platformUserId: data.data.user.open_id }, 'TikTok: user fetched');
    return {
      platformUserId: data.data.user.open_id,
      displayName: data.data.user.display_name,
      avatarUrl: data.data.user.avatar_url ?? null,
    };
  }

  async createLiveStream(
    accessToken: string,
    title: string,
    _description: string | null,
  ): Promise<StreamTarget> {
    this.logger.debug({ title }, 'TikTok: creating live stream');
    const response = await fetch(`${this.baseUrl}/live/stream/create/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      this.logger.error({ status: response.status, title }, 'TikTok: failed to create live stream');
      throw new Error('Failed to create TikTok live stream');
    }

    const data = await response.json() as {
      data: { rtmp_url: string; stream_key: string };
    };

    this.logger.info({ rtmpUrl: data.data.rtmp_url }, 'TikTok: live stream created');
    return {
      rtmpUrl: data.data.rtmp_url,
      streamKey: data.data.stream_key,
      expiresAt: null,
    };
  }

  async endLiveStream(accessToken: string, _streamId: string): Promise<void> {
    this.logger.debug('TikTok: ending live stream');
    await fetch(`${this.baseUrl}/live/stream/end/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    this.logger.info('TikTok: live stream ended');
  }

  async pollComments(
    accessToken: string,
    sessionId: LiveSessionId,
    _socialAccountId: SocialAccountId,
    cursor: string | null,
  ): Promise<CommentPage> {
    this.logger.debug({ sessionId, cursor }, 'TikTok: polling comments');
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);

    const response = await fetch(`${this.baseUrl}/live/comment/list/?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      this.logger.warn({ sessionId, status: response.status }, 'TikTok: comment poll returned non-OK, returning empty');
      return { comments: [], nextCursor: null };
    }

    const data = await response.json() as {
      data: {
        comments: Array<{ id: string; user_id: string; user_name: string; avatar: string; content: string; create_time: number }>;
        next_cursor: string | null;
      };
    };

    const comments: Comment[] = data.data.comments.map((c) => ({
      id: randomUUID() as Comment['id'],
      sessionId,
      platform: SocialPlatform.TIKTOK,
      platformCommentId: c.id,
      authorName: c.user_name,
      authorPlatformUserId: c.user_id,
      authorAvatarUrl: c.avatar,
      content: c.content,
      receivedAt: new Date(c.create_time * 1000),
    }));

    this.logger.debug({ sessionId, count: comments.length, nextCursor: data.data.next_cursor }, 'TikTok: comments polled');
    return { comments, nextCursor: data.data.next_cursor };
  }

  async postComment(
    accessToken: string,
    sessionId: LiveSessionId,
    _socialAccountId: SocialAccountId,
    content: string,
  ): Promise<Comment> {
    this.logger.debug({ sessionId, contentLength: content.length }, 'TikTok: posting comment');
    const response = await fetch(`${this.baseUrl}/live/comment/create/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error({ sessionId, status: response.status, body: text }, 'TikTok: failed to post comment');
      throw new Error(`TikTok post comment failed: ${text}`);
    }

    const data = await response.json() as {
      data: { comment_id: string; create_time: number };
    };

    this.logger.info({ sessionId, platformCommentId: data.data.comment_id }, 'TikTok: comment posted');
    return {
      id: randomUUID() as Comment['id'],
      sessionId,
      platform: SocialPlatform.TIKTOK,
      platformCommentId: data.data.comment_id,
      authorName: '',
      authorPlatformUserId: '',
      authorAvatarUrl: null,
      content,
      receivedAt: new Date(data.data.create_time * 1000),
    };
  }

  async replyToComment(
    accessToken: string,
    sessionId: LiveSessionId,
    _socialAccountId: SocialAccountId,
    parentPlatformCommentId: string,
    parentAuthorPlatformUserId: string,
    content: string,
  ): Promise<Comment> {
    this.logger.debug({ sessionId, parentPlatformCommentId }, 'TikTok: replying to comment');
    const response = await fetch(`${this.baseUrl}/live/comment/create/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        reply_to_comment_id: parentPlatformCommentId,
        reply_to_user_id: parentAuthorPlatformUserId,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error({ sessionId, status: response.status, body: text }, 'TikTok: failed to reply to comment');
      throw new Error(`TikTok reply comment failed: ${text}`);
    }

    const data = await response.json() as {
      data: { comment_id: string; create_time: number };
    };

    this.logger.info({ sessionId, platformCommentId: data.data.comment_id }, 'TikTok: comment reply posted');
    return {
      id: randomUUID() as Comment['id'],
      sessionId,
      platform: SocialPlatform.TIKTOK,
      platformCommentId: data.data.comment_id,
      authorName: '',
      authorPlatformUserId: '',
      authorAvatarUrl: null,
      content,
      receivedAt: new Date(data.data.create_time * 1000),
    };
  }
}
