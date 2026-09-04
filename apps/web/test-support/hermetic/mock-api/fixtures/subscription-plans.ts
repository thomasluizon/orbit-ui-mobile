import type { SubscriptionPlans } from '@orbit/shared/types/subscription'

/** Fixed pricing so the paywall renders identical amounts run-to-run. */
export const subscriptionPlansFixture = {
  monthly: { unitAmount: 900, currency: 'usd' },
  yearly: { unitAmount: 7200, currency: 'usd' },
  savingsPercent: 33,
  couponPercentOff: null,
  currency: 'usd',
} satisfies SubscriptionPlans
