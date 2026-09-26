import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../types/config'
import { isFeatureEnabled } from '../utils/config'
import expectedFlags from './default-config-flags.json'

describe('DEFAULT_CONFIG', () => {
  it('matches the checked feature flag inventory', () => {
    expect(DEFAULT_CONFIG.features).toEqual(expectedFlags)
  })
})

describe('isFeatureEnabled', () => {
  it('returns true for enabled free features', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'gamification', 'free')).toBe(true)
  })

  it('returns true for goals on pro', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'goals', 'pro')).toBe(true)
  })

  it('returns true for goals on free', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'goals', 'free')).toBe(true)
  })

  it('returns false for unknown features', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'missing.feature', 'pro')).toBe(false)
  })
})
