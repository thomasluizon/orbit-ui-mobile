import { describe, expect, it } from 'vitest'
import {
  resolveUpgradeEntitlementDenial,
  resolveUpgradeEntitlementFromError,
} from '../utils/upgrade'

describe('resolveUpgradeEntitlementDenial', () => {
  it('maps a premium requirement code to a pro upgrade', () => {
    expect(resolveUpgradeEntitlementDenial({ code: 'premium', reason: null, status: null })).toEqual({
      shouldUpgrade: true,
      requirement: 'pro',
      reason: null,
    })
  })

  it('infers a yearly requirement from a 403 reason', () => {
    expect(
      resolveUpgradeEntitlementDenial({ status: 403, code: null, reason: 'Yearly plan required' }),
    ).toEqual({
      shouldUpgrade: true,
      requirement: 'yearlyPro',
      reason: 'Yearly plan required',
    })
  })

  it('upgrades on a 403 whose reason only says to upgrade', () => {
    expect(
      resolveUpgradeEntitlementDenial({ status: 403, code: null, reason: 'Please upgrade' }),
    ).toEqual({
      shouldUpgrade: true,
      requirement: 'pro',
      reason: 'Please upgrade',
    })
  })

  it('does not upgrade when nothing indicates an entitlement gap', () => {
    expect(resolveUpgradeEntitlementDenial({ status: 500, code: null, reason: 'Server error' })).toEqual({
      shouldUpgrade: false,
      requirement: null,
      reason: 'Server error',
    })
  })
})

describe('resolveUpgradeEntitlementFromError', () => {
  it('reads status, code and reason off a backend error object', () => {
    const resolution = resolveUpgradeEntitlementFromError({
      status: 403,
      data: { errorCode: 'PAY_GATE', error: 'Upgrade required' },
    })

    expect(resolution.shouldUpgrade).toBe(true)
    expect(resolution.requirement).toBe('pro')
  })
})
