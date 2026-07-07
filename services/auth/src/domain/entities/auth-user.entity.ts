import type { UserId, Email, SubscriptionTier } from '@tik-live-pro/shared-types';
import { SubscriptionTier as ST } from '@tik-live-pro/shared-types';

export interface AuthUserProps {
  id: UserId;
  email: Email;
  passwordHash: string;
  displayName: string;
  avatarUrl: string | null;
  subscriptionTier: SubscriptionTier;
  locale: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OAuthProfileData {
  displayName: string | null;
  avatarUrl: string | null;
  /** Set when the provider attested an email identical to this account's email. */
  emailMatchesProvider: boolean;
}

export class AuthUser {
  private constructor(private props: AuthUserProps) {}

  static create(props: AuthUserProps): AuthUser {
    return new AuthUser(props);
  }

  get id(): UserId { return this.props.id; }
  get email(): Email { return this.props.email; }
  get passwordHash(): string { return this.props.passwordHash; }
  get displayName(): string { return this.props.displayName; }
  get avatarUrl(): string | null { return this.props.avatarUrl; }
  get subscriptionTier(): SubscriptionTier { return this.props.subscriptionTier; }
  get locale(): string { return this.props.locale; }
  get isVerified(): boolean { return this.props.isVerified; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  isPremium(): boolean {
    return this.props.subscriptionTier === ST.PREMIUM;
  }

  /**
   * Backfills profile fields the user never provided from an OAuth provider
   * profile. Existing user-chosen values are never overwritten — only missing
   * data is filled in. Returns true when anything changed so the caller knows
   * whether a DB update is needed.
   */
  fillMissingFromOAuth(profile: OAuthProfileData): boolean {
    let changed = false;

    if (!this.props.avatarUrl && profile.avatarUrl) {
      this.props.avatarUrl = profile.avatarUrl;
      changed = true;
    }
    if (this.props.displayName.trim().length === 0 && profile.displayName) {
      this.props.displayName = profile.displayName;
      changed = true;
    }
    // A provider attesting the same email proves ownership — equivalent to
    // clicking the verification link we'd otherwise have emailed.
    if (!this.props.isVerified && profile.emailMatchesProvider) {
      this.props.isVerified = true;
      changed = true;
    }

    if (changed) this.props.updatedAt = new Date();
    return changed;
  }
}
