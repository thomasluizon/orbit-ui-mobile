import { describe, expect, it } from 'vitest'
import type { SubscriptionStatus } from '../types/profile'
import type { BillingDetails } from '../types/subscription'
import { subscriptionSummary } from '../utils/subscription-summary'

const status: SubscriptionStatus = {
  plan: 'pro', hasProAccess: true, isTrialActive: false, trialEndsAt: null,
  planExpiresAt: '2026-09-28T00:00:00Z', aiMessagesUsed: 8, aiMessagesLimit: 50,
  isLifetimePro: false, subscriptionInterval: 'yearly', source: 'stripe',
  lapseReason: null, subscriptionEndedAtUtc: null,
}
const billing: BillingDetails = {
  status: 'active', currentPeriodEnd: '2026-10-01T00:00:00Z', cancelAtPeriodEnd: false,
  interval: 'monthly', amountPerPeriod: 777, currency: 'usd', paymentMethod: null, recentInvoices: [],
}

describe('subscriptionSummary', () => {
  it('uses the billed interval and renewal date over the status snapshot', () => {
    expect(subscriptionSummary(status, billing)).toEqual({
      nameKey: 'upgrade.billing.plan.monthly', bodyKey: 'upgrade.billing.plan.proBody',
      badgeKey: null, renewal: billing.currentPeriodEnd, renewalKey: 'upgrade.billing.plan.renewsOn',
    })
  })

  it.each(['monthly', 'yearly', null] as const)('uses the known %s interval without billing details', (interval) => {
    expect(subscriptionSummary({ ...status, subscriptionInterval: interval }, null)).toMatchObject({
      nameKey: `upgrade.billing.plan.${interval ?? 'pro'}`, renewal: status.planExpiresAt,
    })
  })

  it('withholds renewal when no date is known', () => {
    expect(subscriptionSummary({ ...status, planExpiresAt: null }, null).renewal).toBeNull()
  })

  it('describes the access end date for a canceled subscription even when payment is also overdue', () => {
    expect(subscriptionSummary(status, { ...billing, cancelAtPeriodEnd: true, status: 'past_due' })).toMatchObject({
      bodyKey: 'upgrade.billing.plan.canceledBody', badgeKey: 'upgrade.billing.plan.canceledBadge',
      renewal: billing.currentPeriodEnd, renewalKey: 'upgrade.billing.plan.canceledHint',
    })
  })

  it('explains overdue payment without claiming the subscription is canceled', () => {
    expect(subscriptionSummary(status, { ...billing, status: 'past_due' })).toMatchObject({
      bodyKey: 'upgrade.billing.plan.pastDueBody', badgeKey: 'upgrade.billing.plan.pastDue',
      renewalKey: 'upgrade.billing.plan.renewsOn',
    })
  })

  it('describes when entitled Play access ends without Stripe billing details', () => {
    expect(subscriptionSummary({ ...status, source: 'play', lapseReason: 'canceled' }, null)).toMatchObject({
      bodyKey: 'upgrade.billing.plan.canceledBody', badgeKey: 'upgrade.billing.plan.canceledBadge',
      renewal: status.planExpiresAt, renewalKey: 'upgrade.billing.plan.canceledHint',
    })
  })

  it('keeps a Play payment retry on the renewal path', () => {
    expect(subscriptionSummary({ ...status, source: 'play', lapseReason: 'payment_failed' }, null)).toMatchObject({
      bodyKey: 'upgrade.billing.plan.proBody', badgeKey: null,
      renewal: status.planExpiresAt, renewalKey: 'upgrade.billing.plan.renewsOn',
    })
  })

  it('keeps lifetime access permanent despite retained cancellation and payment details', () => {
    expect(subscriptionSummary({ ...status, isLifetimePro: true }, { ...billing, cancelAtPeriodEnd: true, status: 'past_due' })).toEqual({
      nameKey: 'upgrade.billing.plan.lifetime', bodyKey: 'upgrade.billing.plan.lifetimeHint',
      badgeKey: 'upgrade.billing.plan.lifetimeBadge', renewal: null, renewalKey: 'upgrade.billing.plan.renewsOn',
    })
  })
})
