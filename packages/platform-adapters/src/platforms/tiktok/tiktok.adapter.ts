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
      throw new Error(`TikTok token exchange failed: ${text}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      scope: data.scope,
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
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
      throw new Error('TikTok token refresh failed');
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
    };
  }

  async revokeTokens(accessToken: string): Promise<void> {
    await fetch(`${this.baseUrl}/oauth/revoke/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async getUser(accessToken: string): Promise<PlatformUser> {
    const response = await fetch(
      `${this.baseUrl}/user/info/?fields=open_id,display_name,avatar_url`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) throw new Error('Failed to fetch TikTok user');

    const data = await response.json() as {
      data: { user: { open_id: string; display_name: string; avatar_url: string } };
    };

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
    const response = await fetch(`${this.baseUrl}/live/stream/create/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) throw new Error('Failed to create TikTok live stream');

    const data = await response.json() as {
      data: { rtmp_url: string; stream_key: string };
    };

    return {
      rtmpUrl: data.data.rtmp_url,
      streamKey: data.data.stream_key,
      expiresAt: null,
    };
  }

  async endLiveStream(accessToken: string, _streamId: string): Promise<void> {
    await fetch(`${this.baseUrl}/live/stream/end/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async pollComments(
    accessToken: string,
    sessionId: LiveSessionId,
    _socialAccountId: SocialAccountId,
    cursor: string | null,
  ): Promise<CommentPage> {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);

    const response = await fetch(`${this.baseUrl}/live/comment/list/?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) return { comments: [], nextCursor: null };

    const data = await response.json() as {
      data: {
        comments: Array<{ id: string; user_name: string; avatar: string; content: string; create_time: number }>;
        next_cursor: string | null;
      };
    };

    const comments: Comment[] = data.data.comments.map((c) => ({
      id: randomUUID() as Comment['id'],
      sessionId,
      platform: SocialPlatform.TIKTOK,
      platformCommentId: c.id,
      authorName: c.user_name,
      authorAvatarUrl: c.avatar,
      content: c.content,
      receivedAt: new Date(c.create_time * 1000),
    }));

    return { comments, nextCursor: data.data.next_cursor };
  }
}
