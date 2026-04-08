import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../types/config'
import { isFeatureEnabled } from '../utils/config'

describe('isFeatureEnabled', () => {
  it('returns true for enabled free features', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'habits.create', 'free')).toBe(true)
  })

  it('returns true for enabled pro features on pro', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'goals', 'pro')).toBe(true)
  })

  it('returns false for enabled pro features on free', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'goals', 'free')).toBe(false)
  })

  it('returns false for unknown features', () => {
    expect(isFeatureEnabled(DEFAULT_CONFIG, 'missing.feature', 'pro')).toBe(false)
  })
})
