import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import {
  DEFAULT_FREE_COLOR_SCHEME,
  TRIAL_EXPIRED_FEATURE_KEYS,
  UPGRADE_FEATURE_CATEGORIES,
  UPGRADE_PRO_FEATURES,
  UPGRADE_YEARLY_EXTRA_FEATURES,
  canAccessEntitlement,
  resolveAccessibleColorScheme,
  resolveUpgradeEntitlementDenial,
} from '../utils/upgrade'

function getMessageValue(
  messages: Record<string, unknown>,
  dottedKey: string,
): unknown {
  return dottedKey.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment]
    }
    return undefined
  }, messages)
}

describe('upgrade utils', () => {
  it('keeps the expired trial checklist aligned', () => {
    expect(TRIAL_EXPIRED_FEATURE_KEYS).toContain('trial.expired.retrospective')
    expect(TRIAL_EXPIRED_FEATURE_KEYS).toContain('trial.expired.goals')
    expect(TRIAL_EXPIRED_FEATURE_KEYS).toContain('trial.expired.apiKeys')
    expect(TRIAL_EXPIRED_FEATURE_KEYS).toContain('trial.expired.achievements')
    expect(TRIAL_EXPIRED_FEATURE_KEYS).toHaveLength(11)
  })

  it('defines the pro and yearly feature lists', () => {
    expect(UPGRADE_PRO_FEATURES.map((feature) => feature.key)).toEqual([
      'unlimited',
      'ai',
      'goals',
      'calendarImport',
      'apiKeys',
      'slipAlerts',
      'achievements',
      'themes',
      'adFree',
    ])
    expect(UPGRADE_YEARLY_EXTRA_FEATURES.map((feature) => feature.key)).toEqual([
      'retrospective',
    ])
  })

  it('has locale entries for every upgrade and trial-expired feature key', () => {
    const localeBundles = [en, ptBR]
    const messageKeys = [
      ...TRIAL_EXPIRED_FEATURE_KEYS,
      ...UPGRADE_PRO_FEATURES.map((feature) => `upgrade.plans.proFeatures.${feature.key}`),
      ...UPGRADE_YEARLY_EXTRA_FEATURES.map((feature) => `upgrade.plans.proFeatures.${feature.key}`),
    ]

    for (const locale of localeBundles) {
      for (const key of messageKeys) {
        expect(getMessageValue(locale as Record<string, unknown>, key)).toEqual(expect.any(String))
      }
    }
  })

  it('defines all upgrade comparison categories', () => {
    expect(UPGRADE_FEATURE_CATEGORIES.map((category) => category.category)).toEqual([
      'habits',
      'ai',
      'insights',
      'personalization',
    ])
    expect(
      UPGRADE_FEATURE_CATEGORIES.flatMap((category) =>
        category.features.map((feature) => feature.key),
      ),
    ).toEqual(
      expect.arrayContaining([
        'calendarImport',
        'goals',
        'apiKeys',
        'premiumColors',
        'retrospective',
      ]),
    )
  })

  it('applies plan checks consistently', () => {
    expect(canAccessEntitlement(null, null)).toBe(true)
    expect(
      canAccessEntitlement(
        { hasProAccess: false, subscriptionInterval: null, isLifetimePro: false },
        'pro',
      ),
    ).toBe(false)
    expect(
      canAccessEntitlement(
        { hasProAccess: true, subscriptionInterval: 'monthly', isLifetimePro: false },
        'pro',
      ),
    ).toBe(true)
    expect(
      canAccessEntitlement(
        { hasProAccess: true, subscriptionInterval: 'monthly', isLifetimePro: false },
        'yearlyPro',
      ),
    ).toBe(false)
    expect(
      canAccessEntitlement(
        { hasProAccess: true, subscriptionInterval: 'yearly', isLifetimePro: false },
        'yearlyPro',
      ),
    ).toBe(true)
  })

  it('falls back to the default free color scheme', () => {
    expect(resolveAccessibleColorScheme('blue', false)).toBe(DEFAULT_FREE_COLOR_SCHEME)
    expect(resolveAccessibleColorScheme('purple', false)).toBe('purple')
    expect(resolveAccessibleColorScheme('blue', true)).toBe('blue')
  })

  it('parses premium denials into upgrade actions', () => {
    expect(
      resolveUpgradeEntitlementDenial({
        code: 'PAY_GATE',
      }),
    ).toEqual({
      shouldUpgrade: true,
      requirement: 'pro',
      reason: null,
    })

    expect(
      resolveUpgradeEntitlementDenial({
        reason: 'feature_plan_required:ai_retrospective:YearlyPro',
      }),
    ).toEqual({
      shouldUpgrade: true,
      requirement: 'yearlyPro',
      reason: 'feature_plan_required:ai_retrospective:YearlyPro',
    })
  })

  it('does not infer an upgrade path from a generic message-limit denial reason', () => {
    expect(
      resolveUpgradeEntitlementDenial({
        status: 403,
        reason: "You've reached your monthly AI message limit (500).",
      }),
    ).toEqual({
      shouldUpgrade: false,
      requirement: null,
      reason: "You've reached your monthly AI message limit (500).",
    })
  })
})
