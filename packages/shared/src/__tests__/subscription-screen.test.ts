import { describe, expect, it } from 'vitest'
import type { SubscriptionStatus } from '../types/profile'
import { resolveSubscriptionScreen } from '../utils/subscription-screen'

const status: SubscriptionStatus = {
  plan: 'pro',
  hasProAccess: true,
  isTrialActive: false,
  trialEndsAt: null,
  planExpiresAt: '2026-09-28T00:00:00Z',
  aiMessagesUsed: 8,
  aiMessagesLimit: 50,
  isLifetimePro: false,
  subscriptionInterval: 'yearly',
  source: 'stripe',
  lapseReason: null,
  subscriptionEndedAtUtc: null,
}

function resolve(overrides: Partial<Parameters<typeof resolveSubscriptionScreen>[0]> = {}) {
  return resolveSubscriptionScreen({
    status,
    isStatusLoading: false,
    isStatusError: false,
    isOnline: true,
    ...overrides,
  })
}

describe('resolveSubscriptionScreen', () => {
  it.each([
    ['loading', { isStatusLoading: true }],
    ['load-failed', { isStatusError: true }],
    ['stripe', {}],
    ['play', { status: { ...status, source: 'play' } }],
    ['trial', { status: { ...status, hasProAccess: true, isTrialActive: true } }],
    ['lifetime', { status: { ...status, isLifetimePro: true } }],
    ['canceled', { cancelAtPeriodEnd: true }],
    ['past-due', { billingStatus: 'past_due' }],
    ['lapsed', { status: { ...status, hasProAccess: false, lapseReason: 'expired' } }],
    ['portal-opening', { portalState: 'opening' }],
    ['portal-failed', { portalState: 'failed' }],
    ['offline', { isOnline: false }],
  ] as const)('resolves %s', (expected, overrides) => {
    expect(resolve(overrides)).toMatchObject({ state: expected })
  })

  it('keeps monthly as a first-class interval axis', () => {
    expect(resolve({ status: { ...status, subscriptionInterval: 'monthly' } })).toMatchObject({
      state: 'stripe',
      interval: 'monthly',
    })
  })

  it('keeps trial and lapsed subscriptions in the pitch view', () => {
    expect(resolve({ status: { ...status, isTrialActive: true } }).view).toBe('pitch')
    expect(
      resolve({
        status: { ...status, hasProAccess: false, lapseReason: 'canceled' },
      }).view,
    ).toBe('pitch')
  })
})
