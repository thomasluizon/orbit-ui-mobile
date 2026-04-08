import { describe, expect, it } from 'vitest'
import {
  TRIAL_EXPIRED_FEATURE_KEYS,
  UPGRADE_FEATURE_CATEGORIES,
  UPGRADE_PRO_FEATURES,
  UPGRADE_YEARLY_EXTRA_FEATURES,
} from '../utils/upgrade'

describe('upgrade utils', () => {
  it('keeps the expired trial checklist aligned', () => {
    expect(TRIAL_EXPIRED_FEATURE_KEYS).toContain('trial.expired.retrospective')
    expect(TRIAL_EXPIRED_FEATURE_KEYS).toHaveLength(6)
  })

  it('defines the pro and yearly feature lists', () => {
    expect(UPGRADE_PRO_FEATURES.map((feature) => feature.key)).toEqual([
      'unlimited',
      'ai',
      'themes',
      'adFree',
    ])
    expect(UPGRADE_YEARLY_EXTRA_FEATURES.map((feature) => feature.key)).toEqual([
      'retrospective',
    ])
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
    ).toContain('calendarImport')
  })
})
