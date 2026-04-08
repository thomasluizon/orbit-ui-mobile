import { describe, expect, it } from 'vitest'
import { ONBOARDING_GOAL_SUGGESTIONS } from '@orbit/shared/utils'

describe('OnboardingCreateGoal data', () => {
  it('exposes the expected goal suggestions', () => {
    expect(ONBOARDING_GOAL_SUGGESTIONS.map((suggestion) => suggestion.key)).toEqual([
      'run',
      'books',
      'save',
    ])
  })

  it('keeps target and unit data for each suggestion', () => {
    for (const suggestion of ONBOARDING_GOAL_SUGGESTIONS) {
      expect(suggestion.target).toBeGreaterThan(0)
      expect(Boolean(suggestion.unit) || Boolean(suggestion.unitKey)).toBe(true)
    }
  })
})
