import { describe, expect, it } from 'vitest'
import type { SubscriptionStatus } from '../types/profile'
import type { BillingDetails } from '../types/subscription'
import { resolvePurchaseResult, resolveUpgradeOrbitLine } from '../utils/upgrade-guide'

const status: SubscriptionStatus = {
  plan: 'pro', hasProAccess: true, isTrialActive: false, trialEndsAt: null,
  planExpiresAt: '2026-09-28T00:00:00Z', aiMessagesUsed: 8, aiMessagesLimit: 250,
  isLifetimePro: false, subscriptionInterval: 'yearly', source: 'stripe',
  lapseReason: null, subscriptionEndedAtUtc: null,
}
const billing: BillingDetails = {
  status: 'active', currentPeriodEnd: '2026-10-01T00:00:00Z', cancelAtPeriodEnd: false,
  interval: 'monthly', amountPerPeriod: 777, currency: 'usd', paymentMethod: null, recentInvoices: [],
}
const usage = { aiMessagesUsed: 3, aiMessagesLimit: 5 }
const ready = { isOnline: true, isLoadingPlans: false, isPlansError: false, usage }

describe('resolveUpgradeOrbitLine', () => {
  it('states the usage fact with the values of the read', () => {
    expect(resolveUpgradeOrbitLine(ready)).toEqual({ key: 'upgrade.orbitLine.usage', used: 3, limit: 5 })
    expect(resolveUpgradeOrbitLine({ ...ready, usage: { aiMessagesUsed: 40, aiMessagesLimit: 250 } }))
      .toEqual({ key: 'upgrade.orbitLine.usage', used: 40, limit: 250 })
  })

  it('names a state before the usage fact: offline, then plans loading, then plans error', () => {
    expect(resolveUpgradeOrbitLine({ ...ready, isOnline: false, isLoadingPlans: true, isPlansError: true })).toEqual({ key: 'upgrade.orbitLine.offline' })
    expect(resolveUpgradeOrbitLine({ ...ready, isLoadingPlans: true, isPlansError: true })).toEqual({ key: 'upgrade.orbitLine.loading' })
    expect(resolveUpgradeOrbitLine({ ...ready, isPlansError: true })).toEqual({ key: 'upgrade.orbitLine.plansError' })
  })

  it('has no line when no state applies and no usage read exists', () => {
    expect(resolveUpgradeOrbitLine({ ...ready, usage: null })).toBeNull()
  })
})

describe('resolvePurchaseResult', () => {
  it('states the renewal date of the subscription record', () => {
    expect(resolvePurchaseResult(status, null)).toEqual({ key: 'upgrade.result.renews', date: status.planExpiresAt })
    expect(resolvePurchaseResult(status, billing)).toEqual({ key: 'upgrade.result.renews', date: billing.currentPeriodEnd })
  })

  it('states the end date when the subscription does not renew', () => {
    expect(resolvePurchaseResult(status, { ...billing, cancelAtPeriodEnd: true })).toEqual({ key: 'upgrade.result.ends', date: billing.currentPeriodEnd })
    expect(resolvePurchaseResult({ ...status, lapseReason: 'canceled' }, null)).toEqual({ key: 'upgrade.result.ends', date: status.planExpiresAt })
  })

  it('has no result before the read reports Pro, on a trial, and for a record with no date', () => {
    expect(resolvePurchaseResult(null, null)).toBeNull()
    expect(resolvePurchaseResult({ ...status, plan: 'free', hasProAccess: false }, null)).toBeNull()
    expect(resolvePurchaseResult({ ...status, isTrialActive: true }, null)).toBeNull()
    expect(resolvePurchaseResult({ ...status, planExpiresAt: null }, null)).toBeNull()
    expect(resolvePurchaseResult({ ...status, isLifetimePro: true }, billing)).toBeNull()
  })
})
