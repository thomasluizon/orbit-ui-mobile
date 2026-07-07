import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types/profile'

const completeOnboardingMock = vi.fn()
const patchProfileMock = vi.fn()
const habitCount = { count: 0, isLoaded: true }

vi.mock('@/app/actions/profile', () => ({
  completeOnboarding: (...args: unknown[]) => completeOnboardingMock(...args),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ patchProfile: patchProfileMock }),
}))

vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitCountLoaded: () => habitCount,
}))

import { useRetainedOnboardingGuard } from '@/hooks/use-retained-onboarding-guard'

function profile(hasCompletedOnboarding: boolean): Profile {
  return createMockProfile({ hasCompletedOnboarding })
}

describe('useRetainedOnboardingGuard', () => {
  beforeEach(() => {
    completeOnboardingMock.mockReset().mockResolvedValue(undefined)
    patchProfileMock.mockReset()
    habitCount.count = 0
    habitCount.isLoaded = true
  })

  it('shows the overlay for a not-onboarded account with no habits', () => {
    const { result } = renderHook(() => useRetainedOnboardingGuard(profile(false), false))
    expect(result.current).toBe(true)
    expect(completeOnboardingMock).not.toHaveBeenCalled()
  })

  it('auto-completes instead of showing when the account already has habits', async () => {
    habitCount.count = 3
    const { result } = renderHook(() => useRetainedOnboardingGuard(profile(false), false))
    expect(result.current).toBe(false)
    await waitFor(() => expect(completeOnboardingMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(patchProfileMock).toHaveBeenCalledWith({ hasCompletedOnboarding: true }),
    )
  })

  it('waits (no overlay, no auto-complete) while the habit count is loading', () => {
    habitCount.isLoaded = false
    const { result } = renderHook(() => useRetainedOnboardingGuard(profile(false), false))
    expect(result.current).toBe(false)
    expect(completeOnboardingMock).not.toHaveBeenCalled()
  })

  it('waits while suppressed even when habits are present', () => {
    habitCount.count = 3
    const { result } = renderHook(() => useRetainedOnboardingGuard(profile(false), true))
    expect(result.current).toBe(false)
    expect(completeOnboardingMock).not.toHaveBeenCalled()
  })

  it('does nothing once onboarding is already complete', () => {
    habitCount.count = 3
    const { result } = renderHook(() => useRetainedOnboardingGuard(profile(true), false))
    expect(result.current).toBe(false)
    expect(completeOnboardingMock).not.toHaveBeenCalled()
  })

  it('freezes the no-habits decision so habits created mid-flow keep the overlay open', () => {
    const stable = profile(false)
    const { result, rerender } = renderHook(() =>
      useRetainedOnboardingGuard(stable, false),
    )
    expect(result.current).toBe(true)

    habitCount.count = 1
    rerender()

    expect(result.current).toBe(true)
    expect(completeOnboardingMock).not.toHaveBeenCalled()
  })
})
