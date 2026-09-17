import { describe, expect, it } from 'vitest'
import {
  getOnboardingReminderPreviewTime,
  ONBOARDING_STARTERS,
} from '@orbit/shared/utils'

describe('OnboardingCreateHabit data', () => {
  it('exposes the four sentence starters', () => {
    expect(ONBOARDING_STARTERS).toEqual(['water', 'walk', 'read', 'tidy'])
  })

  it('previews reminders fifteen minutes early', () => {
    expect(getOnboardingReminderPreviewTime('18:00')).toBe('17:45')
  })
})
