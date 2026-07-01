import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import {
  DEFAULT_FREE_COLOR_SCHEME,
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

const allMatrixRows = UPGRADE_FEATURE_CATEGORIES.flatMap((category) => category.features)

describe('upgrade utils', () => {
  it('marks AI Retrospective as yearly-only Pro, not a Pro cross', () => {
    const retrospective = allMatrixRows.find((feature) => feature.key === 'retrospective')
    expect(retrospective).toBeDefined()
    expect(retrospective?.type).toBe('boolean')
    expect(retrospective?.free).toBe(false)
    expect(retrospective?.pro).toBe('yearly')
  })

  it('keeps the post-rebalance free essentials positive on both tiers', () => {
    const insights = UPGRADE_FEATURE_CATEGORIES.find((category) => category.category === 'insights')
    const freePositive = (insights?.features ?? [])
      .filter((feature) => feature.free === true && feature.pro === true)
      .map((feature) => feature.key)
    expect(freePositive).toEqual(
      expect.arrayContaining(['streaks', 'xpLevels', 'streakFreeze']),
    )
  })

  it('defines the shrunk marquee and the yearly extra', () => {
    expect(UPGRADE_PRO_FEATURES.map((feature) => feature.key)).toEqual([
      'unlimited',
      'ai',
      'goals',
      'themes',
    ])
    expect(UPGRADE_YEARLY_EXTRA_FEATURES.map((feature) => feature.key)).toEqual([
      'retrospective',
    ])
  })

  it('groups the matrix under four icon-led categories', () => {
    expect(UPGRADE_FEATURE_CATEGORIES.map((category) => category.category)).toEqual([
      'habits',
      'ai',
      'insights',
      'personalization',
    ])
    for (const category of UPGRADE_FEATURE_CATEGORIES) {
      expect(typeof category.iconKey).toBe('string')
    }
  })

  it('has matching locale entries in both en and pt-BR for every rendered key', () => {
    const matrixKeys = UPGRADE_FEATURE_CATEGORIES.flatMap((category) => [
      `upgrade.categories.${category.category}`,
      ...category.features.flatMap((feature) =>
        feature.type === 'text'
          ? [
              `upgrade.features.${feature.key}.label`,
              `upgrade.features.${feature.key}.free`,
              `upgrade.features.${feature.key}.pro`,
            ]
          : [`upgrade.features.${feature.key}.label`],
      ),
    ])
    const marqueeKeys = [...UPGRADE_PRO_FEATURES, ...UPGRADE_YEARLY_EXTRA_FEATURES].map(
      (feature) => `upgrade.plans.proFeatures.${feature.key}`,
    )
    const copyKeys = [
      'upgrade.matrix.title',
      'upgrade.matrix.included',
      'upgrade.matrix.notIncluded',
      'upgrade.matrix.yearlyTag',
      'upgrade.convert.promise',
      'upgrade.convert.trialCta',
      'upgrade.convert.freeCta',
      'upgrade.convert.trustLine',
      'upgrade.convert.stayFree',
      'upgrade.convert.cancelAnytime',
      'upgrade.plans.free.note',
      'upgrade.plans.monthly.note',
      'upgrade.plans.yearly.heroLine',
      'upgrade.plans.yearly.billedSave',
    ]
    const messageKeys = [...matrixKeys, ...marqueeKeys, ...copyKeys]

    for (const locale of [en, ptBR]) {
      for (const key of messageKeys) {
        expect(getMessageValue(locale as Record<string, unknown>, key)).toEqual(
          expect.any(String),
        )
      }
    }
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
    expect(resolveUpgradeEntitlementDenial({ code: 'PAY_GATE' })).toEqual({
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
