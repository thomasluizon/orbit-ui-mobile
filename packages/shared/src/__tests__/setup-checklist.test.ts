import { describe, expect, it } from 'vitest'
import { createMockProfile } from './factories'
import { getSetupChecklist } from '../utils/setup-checklist'

const readyProfile = () => createMockProfile({ isTrialActive: false })

describe('setup checklist', () => {
  it('tracks the three production flags independently and recomputes progress', () => {
    const profile = readyProfile()
    expect(getSetupChecklist(profile)?.done).toBe(0)
    profile.hasCreatedFirstHabit = true
    expect(getSetupChecklist(profile)?.items.map((item) => item.done)).toEqual([true, false, false])
    profile.hasLoggedFirstHabit = true
    expect(getSetupChecklist(profile)?.done).toBe(2)
    profile.hasTriedAstra = true
    expect(getSetupChecklist(profile)?.done).toBe(3)
  })

  it('waits for the unified onboarding flow and preserves the production trial priority', () => {
    expect(getSetupChecklist(undefined)).toBeNull()
    expect(getSetupChecklist(createMockProfile({ hasCompletedOnboarding: false }))).toBeNull()
    expect(getSetupChecklist(createMockProfile({ isTrialActive: true }))).toBeNull()
    expect(getSetupChecklist(createMockProfile({ isTrialActive: false, hasCompletedOnboardingChecklist: true }))).toBeNull()
    expect(getSetupChecklist(readyProfile())).not.toBeNull()
  })
})
