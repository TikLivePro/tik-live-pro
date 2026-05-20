import type { AuthUser } from '../entities/auth-user.entity.js';
import type { Email, UserId } from '@tik-live-pro/shared-types';

export interface OAuthAccountData {
  id: string;
  userId: UserId;
  provider: string;
  providerUserId: string;
  providerEmail: string | null;
}

export interface IAuthUserRepository {
  findById(id: UserId): Promise<AuthUser | null>;
  findByEmail(email: Email): Promise<AuthUser | null>;
  findByOAuthAccount(provider: string, providerUserId: string): Promise<AuthUser | null>;
  save(user: AuthUser): Promise<void>;
  update(user: AuthUser): Promise<void>;
  delete(id: UserId): Promise<void>;
  saveOAuthAccount(account: OAuthAccountData): Promise<void>;
}
