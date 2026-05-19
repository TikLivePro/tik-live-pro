import type { UserId, Email, SubscriptionTier } from '@tik-live-pro/shared-types';
import { SubscriptionTier as ST } from '@tik-live-pro/shared-types';

export interface AuthUserProps {
  id: UserId;
  email: Email;
  passwordHash: string;
  displayName: string;
  subscriptionTier: SubscriptionTier;
  locale: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
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
  get subscriptionTier(): SubscriptionTier { return this.props.subscriptionTier; }
  get locale(): string { return this.props.locale; }
  get isVerified(): boolean { return this.props.isVerified; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  isPremium(): boolean {
    return this.props.subscriptionTier === ST.PREMIUM;
  }
}
