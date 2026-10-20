import type { SubscriptionPlans } from '@orbit/shared/types/subscription'

export const subscriptionPlansFixtures = {
  usd: {
    monthly: { unitAmount: 999, currency: 'usd' },
    yearly: { unitAmount: 6999, currency: 'usd' },
    savingsPercent: 42,
    couponPercentOff: null,
    currency: 'usd',
  },
  brl: {
    monthly: { unitAmount: 2990, currency: 'brl' },
    yearly: { unitAmount: 19900, currency: 'brl' },
    savingsPercent: 45,
    couponPercentOff: null,
    currency: 'brl',
  },
} satisfies Record<'usd' | 'brl', SubscriptionPlans>

export const subscriptionPlansFixture = subscriptionPlansFixtures.usd
