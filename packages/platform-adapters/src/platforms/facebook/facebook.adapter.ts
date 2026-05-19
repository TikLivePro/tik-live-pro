import type { IPlatformAdapter, OAuthTokens, StreamTarget, PlatformUser, CommentPage } from '../../interface/platform-adapter.interface.js';
import type { Comment, LiveSessionId, SocialAccountId } from '@tik-live-pro/shared-types';
import { SocialPlatform } from '@tik-live-pro/shared-types';
import type { Logger } from '@tik-live-pro/logger';
import { randomUUID } from 'node:crypto';

export interface FacebookAdapterConfig {
  appId: string;
  appSecret: string;
  graphApiVersion?: string;
}

export class FacebookAdapter implements IPlatformAdapter {
  readonly platform = SocialPlatform.FACEBOOK;

  private readonly graphBase: string;

  constructor(
    private readonly config: FacebookAdapterConfig,
    private readonly logger: Logger,
  ) {
    const version = config.graphApiVersion ?? 'v21.0';
    this.graphBase = `https://graph.facebook.com/${version}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    this.logger.debug({ code: code.slice(0, 8) }, 'Facebook: exchanging auth code');

    const params = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const response = await fetch(`${this.graphBase}/oauth/access_token?${params.toString()}`);
    if (!response.ok) throw new Error('Facebook token exchange failed');

    const data = await response.json() as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      refreshToken: null,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: '',
    };
  }

  async refreshTokens(_refreshToken: string): Promise<OAuthTokens> {
    throw new Error('Facebook does not support refresh tokens — re-authorize instead');
  }

  async revokeTokens(accessToken: string): Promise<void> {
    const me = await this.getMeId(accessToken);
    await fetch(`${this.graphBase}/${me}/permissions?access_token=${accessToken}`, {
      method: 'DELETE',
    });
  }

  async getUser(accessToken: string): Promise<PlatformUser> {
    const response = await fetch(
      `${this.graphBase}/me?fields=id,name,picture&access_token=${accessToken}`,
    );
    if (!response.ok) throw new Error('Failed to fetch Facebook user');

    const data = await response.json() as {
      id: string;
      name: string;
      picture: { data: { url: string } };
    };

    return {
      platformUserId: data.id,
      displayName: data.name,
      avatarUrl: data.picture.data.url ?? null,
    };
  }

  async createLiveStream(
    accessToken: string,
    title: string,
    description: string | null,
  ): Promise<StreamTarget> {
    const me = await this.getMeId(accessToken);
    const response = await fetch(`${this.graphBase}/${me}/live_videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: description ?? '',
        status: 'LIVE_NOW',
        access_token: accessToken,
      }),
    });

    if (!response.ok) throw new Error('Failed to create Facebook live video');

    const data = await response.json() as {
      id: string;
      stream_url: string;
      secure_stream_url: string;
    };

    const url = new URL(data.secure_stream_url || data.stream_url);
    const streamKey = url.pathname.split('/').pop() ?? data.id;

    return {
      rtmpUrl: `${url.protocol}//${url.host}${url.pathname.replace(`/${streamKey}`, '')}`,
      streamKey,
      platformStreamId: data.id,
      expiresAt: null,
    };
  }

  async endLiveStream(accessToken: string, streamId: string): Promise<void> {
    await fetch(`${this.graphBase}/${streamId}`, {
      method: 'POST',
      body: new URLSearchParams({ end_live_video: 'true', access_token: accessToken }),
    });
  }

  async pollComments(
    accessToken: string,
    sessionId: LiveSessionId,
    socialAccountId: SocialAccountId,
    cursor: string | null,
  ): Promise<CommentPage> {
    const params = new URLSearchParams({
      fields: 'id,from,message,created_time',
      access_token: accessToken,
      limit: '50',
    });
    if (cursor) params.set('after', cursor);

    const response = await fetch(
      `${this.graphBase}/${socialAccountId}/comments?${params.toString()}`,
    );

    if (!response.ok) return { comments: [], nextCursor: null };

    const data = await response.json() as {
      data: Array<{ id: string; from: { name: string }; message: string; created_time: string }>;
      paging?: { cursors?: { after: string } };
    };

    const comments: Comment[] = data.data.map((c) => ({
      id: randomUUID() as Comment['id'],
      sessionId,
      platform: SocialPlatform.FACEBOOK,
      platformCommentId: c.id,
      authorName: c.from.name,
      authorAvatarUrl: null,
      content: c.message,
      receivedAt: new Date(c.created_time),
    }));

    return {
      comments,
      nextCursor: data.paging?.cursors?.after ?? null,
    };
  }

  private async getMeId(accessToken: string): Promise<string> {
    const response = await fetch(`${this.graphBase}/me?access_token=${accessToken}`);
    const data = await response.json() as { id: string };
    return data.id;
  }
}
