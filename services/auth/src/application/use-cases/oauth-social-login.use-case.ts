import { randomUUID } from 'node:crypto';
import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.js';
import type { ITokenService, TokenPair } from '../../domain/services/token.service.js';
import { AuthUser } from '../../domain/entities/auth-user.entity.js';
import { EmailVO } from '@tik-live-pro/domain';
import { UnauthorizedError } from '@tik-live-pro/domain';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { Subjects } from '@tik-live-pro/events';
import type { UserId, Email } from '@tik-live-pro/shared-types';
import { SubscriptionTier } from '@tik-live-pro/shared-types';
import type { UserRegisteredPayload } from '@tik-live-pro/events';
import type { Logger } from '@tik-live-pro/logger';

export type OAuthProvider = 'google' | 'facebook' | 'tiktok';

const PROVIDER_FETCH_TIMEOUT_MS = 10_000;

export interface OAuthSocialLoginInput {
  provider: OAuthProvider;
  accessToken: string;
}

export interface OAuthSocialLoginOutput extends TokenPair {
  userId: UserId;
  subscriptionTier: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

interface ProviderProfile {
  providerUserId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  locale: string | null;
}

async function fetchGoogleProfile(accessToken: string): Promise<ProviderProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new UnauthorizedError('Invalid Google access token');
  const data = (await res.json()) as {
    sub: string;
    name?: string;
    email?: string;
    picture?: string;
    locale?: string;
  };
  return {
    providerUserId: data.sub,
    email: data.email ?? null,
    displayName: data.name ?? 'Google User',
    avatarUrl: data.picture ?? null,
    locale: data.locale ? data.locale.split('-')[0] ?? null : null,
  };
}

async function fetchFacebookProfile(accessToken: string): Promise<ProviderProfile> {
  const url = `https://graph.facebook.com/v21.0/me?fields=id,name,email,picture.width(256).height(256),locale&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new UnauthorizedError('Invalid Facebook access token');
  const data = (await res.json()) as {
    id: string;
    name?: string;
    email?: string;
    picture?: { data?: { url?: string } };
    locale?: string;
    error?: unknown;
  };
  if (data.error) throw new UnauthorizedError('Invalid Facebook access token');
  return {
    providerUserId: data.id,
    email: data.email ?? null,
    displayName: data.name ?? 'Facebook User',
    avatarUrl: data.picture?.data?.url ?? null,
    locale: data.locale ? data.locale.split('_')[0] ?? null : null,
  };
}

async function fetchTikTokProfile(accessToken: string): Promise<ProviderProfile> {
  const res = await fetch(
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,email',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new UnauthorizedError('Invalid TikTok access token');
  const data = (await res.json()) as {
    data?: { user?: { open_id?: string; display_name?: string; email?: string; avatar_url?: string } };
    error?: { code?: string };
  };
  if (data.error?.code && data.error.code !== 'ok') {
    throw new UnauthorizedError('Invalid TikTok access token');
  }
  const user = data.data?.user;
  if (!user?.open_id) throw new UnauthorizedError('Invalid TikTok access token');
  return {
    providerUserId: user.open_id,
    email: user.email ?? null,
    displayName: user.display_name ?? 'TikTok User',
    avatarUrl: user.avatar_url ?? null,
    locale: null,
  };
}

export class OAuthSocialLoginUseCase {
  constructor(
    private readonly userRepo: IAuthUserRepository,
    private readonly tokenService: ITokenService,
    private readonly nats: NatsJetStreamClient,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: OAuthSocialLoginInput,
    correlationId: string,
  ): Promise<OAuthSocialLoginOutput> {
    const log = this.logger.child({
      correlationId,
      useCase: 'OAuthSocialLoginUseCase',
      provider: input.provider,
    });

    log.debug('OAuth login: verifying provider token');
    const profile = await this.verifyProviderToken(input.provider, input.accessToken);
    log.debug({ providerUserId: profile.providerUserId }, 'OAuth login: provider verified');

    let user = await this.userRepo.findByOAuthAccount(input.provider, profile.providerUserId);

    // Auto-link: an OAuth identity whose provider-attested email matches an
    // existing account (email/password or another provider) is attached to
    // that account instead of creating a duplicate user.
    if (!user && profile.email) {
      try {
        const emailVO = EmailVO.create(profile.email);
        const existingByEmail = await this.userRepo.findByEmail(emailVO.branded);
        if (existingByEmail) {
          user = existingByEmail;
          await this.userRepo.saveOAuthAccount({
            id: randomUUID(),
            userId: user.id,
            provider: input.provider,
            providerUserId: profile.providerUserId,
            providerEmail: profile.email,
          });
          log.info({ userId: user.id }, 'OAuth login: linked to existing account by email');
        }
      } catch {
        // email from provider failed validation — treat as unavailable
      }
    }

    if (user) {
      // Backfill profile data the account is missing (avatar, display name)
      // and mark the email verified when the provider attested the same
      // address. User-chosen values are never overwritten.
      const emailMatchesProvider =
        !!profile.email && profile.email.toLowerCase() === user.email.toLowerCase();
      const changed = user.fillMissingFromOAuth({
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        emailMatchesProvider,
      });
      if (changed) {
        await this.userRepo.update(user);
        log.info({ userId: user.id }, 'OAuth login: backfilled missing profile data from provider');
      }
    } else {
      const userId = randomUUID() as UserId;
      const email = (
        profile.email ?? `${profile.providerUserId}@${input.provider}.oauth`
      ) as Email;
      const locale = profile.locale ?? 'en';
      const now = new Date();

      user = AuthUser.create({
        id: userId,
        email,
        passwordHash: '',
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        subscriptionTier: SubscriptionTier.FREE,
        locale,
        isVerified: true,
        createdAt: now,
        updatedAt: now,
      });

      await this.userRepo.save(user);
      await this.userRepo.saveOAuthAccount({
        id: randomUUID(),
        userId,
        provider: input.provider,
        providerUserId: profile.providerUserId,
        providerEmail: profile.email,
      });

      const eventPayload: UserRegisteredPayload = {
        userId,
        email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        subscriptionTier: SubscriptionTier.FREE,
        locale,
      };
      await this.nats.publish(Subjects.AUTH_USER_REGISTERED, eventPayload, { correlationId });
      log.info({ userId }, 'OAuth login: new user created via OAuth');
    }

    const tokens = await this.tokenService.generateTokenPair(
      user.id,
      user.email,
      user.subscriptionTier,
    );

    log.info({ userId: user.id }, 'OAuth login: success');
    return {
      userId: user.id,
      subscriptionTier: user.subscriptionTier,
      displayName: user.displayName,
      email: profile.email,
      avatarUrl: user.avatarUrl,
      ...tokens,
    };
  }

  private verifyProviderToken(
    provider: OAuthProvider,
    accessToken: string,
  ): Promise<ProviderProfile> {
    switch (provider) {
      case 'google':
        return fetchGoogleProfile(accessToken);
      case 'facebook':
        return fetchFacebookProfile(accessToken);
      case 'tiktok':
        return fetchTikTokProfile(accessToken);
    }
  }
}
