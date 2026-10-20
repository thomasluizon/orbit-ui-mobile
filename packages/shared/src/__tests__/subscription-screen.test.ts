import { describe, expect, it } from 'vitest'
import type { SubscriptionStatus } from '../types/profile'
import { resolveSubscriptionScreen, resolveUpgradeHeader } from '../utils/subscription-screen'

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

  it('recognizes a lapsed plan from the end date without a reason', () => {
    expect(resolve({ status: { ...status, plan: 'free', hasProAccess: false, lapseReason: null, subscriptionEndedAtUtc: '2026-09-01T00:00:00Z' } })).toMatchObject({ state: 'lapsed' })
  })

  it('keeps lifetime access out of the Play handoff even with a retained Play source', () => {
    expect(resolve({ status: { ...status, source: 'play', isLifetimePro: true } })).toMatchObject({ state: 'lifetime', content: 'stripe' })
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

  it('keeps the offline notice authoritative when live status is unavailable', () => {
    expect(resolve({ status: null, isStatusError: true, isOnline: false })).toMatchObject({
      state: 'offline',
      content: 'pitch',
      view: 'pitch',
    })
  })

  it('keeps cached pitch content and the confirmed provider while offline', () => {
    expect(resolve({ status: { ...status, isTrialActive: true }, isOnline: false })).toMatchObject({
      state: 'offline',
      content: 'pitch',
      provider: 'stripe',
    })
    expect(resolve({ status: { ...status, source: 'play' }, isOnline: false })).toMatchObject({
      state: 'offline',
      content: 'play',
      provider: 'play',
    })
  })

  it('requires both the Pro plan and the trial flag for the trial state', () => {
    expect(
      resolve({
        status: { ...status, plan: 'free', hasProAccess: false, isTrialActive: true },
      }),
    ).toMatchObject({ state: 'free', view: 'pitch' })
  })

  it.each(['canceled', 'payment_failed', 'expired'] as const)(
    'keeps the %s lapse reason in the pitch view',
    (lapseReason) => {
      expect(
        resolve({
          status: {
            ...status,
            plan: 'free',
            hasProAccess: false,
            lapseReason,
          },
        }),
      ).toMatchObject({ state: 'lapsed', content: 'pitch', provider: 'stripe' })
    },
  )

  it.each([
    ['stripe', 'stripe'],
    ['play', 'play'],
    [null, 'stripe'],
  ] as const)('selects %s provider content for a paid plan', (source, content) => {
    expect(resolve({ status: { ...status, source } })).toMatchObject({
      state: source === 'play' ? 'play' : 'stripe',
      content,
      provider: source,
      view: 'manage',
    })
  })

  it.each([
    ['stripe', 'stripe'],
    ['play', 'play'],
    [null, 'stripe'],
  ] as const)('keeps cached %s paid content offline', (source, content) => {
    expect(resolve({ status: { ...status, source }, isOnline: false })).toMatchObject({
      state: 'offline',
      content,
      provider: source,
      view: 'manage',
    })
  })

  it('resolves billing loading and failure only for the Stripe management view', () => {
    expect(resolve({ isBillingLoading: true })).toMatchObject({ state: 'loading' })
    expect(resolve({ isBillingError: true })).toMatchObject({ state: 'load-failed' })
    expect(
      resolve({
        status: { ...status, source: 'play' },
        isBillingLoading: true,
        isBillingError: true,
      }),
    ).toMatchObject({ state: 'play' })
  })

  it('treats an absent status as a load failure when online', () => {
    expect(resolve({ status: null })).toMatchObject({
      state: 'load-failed',
      content: 'pitch',
      interval: null,
      provider: null,
      view: 'pitch',
    })
  })
})

describe('resolveUpgradeHeader', () => {
  const free: SubscriptionStatus = { ...status, plan: 'free', hasProAccess: false, planExpiresAt: null, subscriptionInterval: null, source: null }
  const lapsed: SubscriptionStatus = { ...free, lapseReason: 'expired' }

  it('titles the pitch Orbit Pro for a free account', () => {
    expect(resolveUpgradeHeader(free, resolve({ status: free }), true)).toEqual({ lapsedNoticeStatus: null, titleKey: 'upgrade.pitchTitle' })
  })

  it('keeps the subscription title and the lapsed notice when the pitch is not shown', () => {
    expect(resolveUpgradeHeader(lapsed, resolve({ status: lapsed }), false)).toEqual({ lapsedNoticeStatus: lapsed, titleKey: 'upgrade.title' })
  })

  it('drops the lapsed notice while the pitch is shown', () => {
    expect(resolveUpgradeHeader(lapsed, resolve({ status: lapsed }), true)).toEqual({ lapsedNoticeStatus: null, titleKey: 'upgrade.pitchTitle' })
  })

  it('uses the subscription title for the management view and a failed load', () => {
    expect(resolveUpgradeHeader(status, resolve(), false).titleKey).toBe('upgrade.title')
    expect(resolveUpgradeHeader(null, resolve({ status: null, isStatusError: true }), false).titleKey).toBe('upgrade.title')
  })

  it('shows no title before the status arrives or when the caller withholds it', () => {
    expect(resolveUpgradeHeader(null, resolve({ status: null, isStatusLoading: true }), true).titleKey).toBeNull()
    expect(resolveUpgradeHeader(free, resolve({ status: free }), true, false).titleKey).toBeNull()
  })
})
