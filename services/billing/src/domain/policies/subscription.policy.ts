import type { Entitlement, Feature, UserId } from '@tik-live-pro/shared-types';
import { SubscriptionTier, Feature as F } from '@tik-live-pro/shared-types';
import { EntitlementError } from '@tik-live-pro/domain';

const FREEMIUM_ACCOUNT_LIMIT = 2;

const TIER_FEATURES: Record<string, Feature[]> = {
  [SubscriptionTier.FREE]: [],
  [SubscriptionTier.PREMIUM]: [
    F.UNLIMITED_ACCOUNTS,
    F.ANALYTICS_DASHBOARD,
    F.COMMENT_MODERATION,
  ],
  [SubscriptionTier.BUSINESS]: [
    F.UNLIMITED_ACCOUNTS,
    F.ANALYTICS_DASHBOARD,
    F.COMMENT_MODERATION,
    F.STREAM_RECORDING,
    F.PRIORITY_SUPPORT,
  ],
};

const TIER_ACCOUNT_LIMIT: Record<string, number> = {
  [SubscriptionTier.FREE]: FREEMIUM_ACCOUNT_LIMIT,
  [SubscriptionTier.PREMIUM]: Infinity,
  [SubscriptionTier.BUSINESS]: Infinity,
};

export class SubscriptionPolicy {
  buildEntitlement(userId: UserId, tier: string): Entitlement {
    const resolvedTier = Object.values(SubscriptionTier).includes(tier as typeof SubscriptionTier[keyof typeof SubscriptionTier])
      ? (tier as typeof SubscriptionTier[keyof typeof SubscriptionTier])
      : SubscriptionTier.FREE;

    return {
      userId,
      tier: resolvedTier,
      features: TIER_FEATURES[resolvedTier] ?? [],
      maxSocialAccounts: TIER_ACCOUNT_LIMIT[resolvedTier] ?? FREEMIUM_ACCOUNT_LIMIT,
    };
  }

  assertCanAddAccount(entitlement: Entitlement, currentCount: number): void {
    if (currentCount >= entitlement.maxSocialAccounts) {
      throw new EntitlementError(
        `Account limit reached. Free plan allows ${FREEMIUM_ACCOUNT_LIMIT} accounts. Upgrade to Premium for unlimited accounts.`,
      );
    }
  }

  assertHasFeature(entitlement: Entitlement, feature: Feature): void {
    if (!entitlement.features.includes(feature)) {
      throw new EntitlementError(`Feature '${feature}' requires a Premium subscription`);
    }
  }
}
