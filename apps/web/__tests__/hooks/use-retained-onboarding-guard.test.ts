import { describe, expect, it } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { useRetainedOnboardingGuard } from '@/hooks/use-retained-onboarding-guard'

const unfinished = createMockProfile({ hasCompletedOnboarding: false })
const finished = createMockProfile({ hasCompletedOnboarding: true })

describe('retained onboarding account decision', () => {
  it('shows onboarding whenever the account flag is false', () => {
    expect(useRetainedOnboardingGuard(unfinished, false)).toBe(true)
  })

  it('waits for the profile and buffered answers', () => {
    expect(useRetainedOnboardingGuard(undefined, false)).toBe(false)
    expect(useRetainedOnboardingGuard(null, false)).toBe(false)
    expect(useRetainedOnboardingGuard(unfinished, true)).toBe(false)
  })

  it('does not show onboarding for an onboarded account', () => {
    expect(useRetainedOnboardingGuard(finished, false)).toBe(false)
  })

  it('keeps deferred push recovery available after onboarding was applied', () => {
    expect(useRetainedOnboardingGuard(finished, true, true)).toBe(true)
  })
})
