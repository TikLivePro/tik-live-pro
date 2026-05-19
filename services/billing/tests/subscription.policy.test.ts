import { SubscriptionPolicy } from '../src/domain/policies/subscription.policy.js';
import { SubscriptionTier, Feature } from '@tik-live-pro/shared-types';
import { EntitlementError } from '@tik-live-pro/domain';
import type { UserId } from '@tik-live-pro/shared-types';

const userId = 'user-1' as UserId;
const policy = new SubscriptionPolicy();

describe('SubscriptionPolicy', () => {
  describe('buildEntitlement', () => {
    it('gives free tier correct limits', () => {
      const ent = policy.buildEntitlement(userId, SubscriptionTier.FREE);
      expect(ent.maxSocialAccounts).toBe(2);
      expect(ent.features).toHaveLength(0);
    });

    it('gives premium tier unlimited accounts', () => {
      const ent = policy.buildEntitlement(userId, SubscriptionTier.PREMIUM);
      expect(ent.maxSocialAccounts).toBe(Infinity);
      expect(ent.features).toContain(Feature.UNLIMITED_ACCOUNTS);
      expect(ent.features).toContain(Feature.ANALYTICS_DASHBOARD);
    });

    it('falls back to free for unknown tier', () => {
      const ent = policy.buildEntitlement(userId, 'unknown');
      expect(ent.tier).toBe(SubscriptionTier.FREE);
    });
  });

  describe('assertCanAddAccount', () => {
    it('allows adding when under limit', () => {
      const ent = policy.buildEntitlement(userId, SubscriptionTier.FREE);
      expect(() => policy.assertCanAddAccount(ent, 1)).not.toThrow();
    });

    it('throws EntitlementError when at free limit', () => {
      const ent = policy.buildEntitlement(userId, SubscriptionTier.FREE);
      expect(() => policy.assertCanAddAccount(ent, 2)).toThrow(EntitlementError);
    });

    it('allows unlimited for premium', () => {
      const ent = policy.buildEntitlement(userId, SubscriptionTier.PREMIUM);
      expect(() => policy.assertCanAddAccount(ent, 100)).not.toThrow();
    });
  });

  describe('assertHasFeature', () => {
    it('throws for free user trying premium feature', () => {
      const ent = policy.buildEntitlement(userId, SubscriptionTier.FREE);
      expect(() => policy.assertHasFeature(ent, Feature.ANALYTICS_DASHBOARD)).toThrow(EntitlementError);
    });

    it('passes for premium user with premium feature', () => {
      const ent = policy.buildEntitlement(userId, SubscriptionTier.PREMIUM);
      expect(() => policy.assertHasFeature(ent, Feature.ANALYTICS_DASHBOARD)).not.toThrow();
    });
  });
});
