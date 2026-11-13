import { describe, expect, it } from 'vitest'
import { getDeleteAccountWarningKeys } from '../utils/delete-account'

const now = new Date('2026-11-13T12:00:00Z')

describe('getDeleteAccountWarningKeys', () => {
  it.each([
    [{ hasProAccess: true, planExpiresAt: '2026-12-01T00:00:00Z', billingProvider: 'stripe', subscriptionSource: 'stripe' }, 'profile.deleteAccount.warningPro', null],
    [{ hasProAccess: true, planExpiresAt: '2026-11-01T00:00:00Z', billingProvider: 'stripe', subscriptionSource: 'stripe' }, 'profile.deleteAccount.warningFree', null],
    [{ hasProAccess: true, planExpiresAt: null, billingProvider: null, subscriptionSource: null }, 'profile.deleteAccount.warningFree', null],
    [{ hasProAccess: false, planExpiresAt: null, billingProvider: null, subscriptionSource: null }, 'profile.deleteAccount.warningFree', null],
    [{ hasProAccess: true, planExpiresAt: '2026-12-01T00:00:00Z', billingProvider: 'app_store', subscriptionSource: null }, 'profile.deleteAccount.warningPro', 'profile.deleteAccount.warningAppStore'],
  ] as const)('names the warning for the plan %#', (profile, plan, store) => {
    expect(getDeleteAccountWarningKeys(profile, now)).toEqual({ plan, store })
  })

  it('names the free warning before the profile loads', () => {
    expect(getDeleteAccountWarningKeys(undefined, now)).toEqual({ plan: 'profile.deleteAccount.warningFree', store: null })
  })
})
