import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'

let mockProfile: Profile | undefined
const startCoachTour = vi.fn()
const storeState = { isActive: false, startCoachTour }

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

vi.mock('@/stores/tour-store', () => ({
  useTourStore: { getState: () => storeState },
}))

import { useCoachTour } from '@/hooks/use-coach-tour'

describe('useCoachTour', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    startCoachTour.mockClear()
    storeState.isActive = false
    localStorage.clear()
    mockProfile = createMockProfile({
      hasCompletedOnboarding: true,
      hasCompletedTour: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts the coach tour once and records it as seen', () => {
    renderHook(() => useCoachTour())
    vi.advanceTimersByTime(700)

    expect(startCoachTour).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('orbit_coach_tour_seen')).toBe('true')
  })

  it('does not start again once it has been seen', () => {
    localStorage.setItem('orbit_coach_tour_seen', 'true')
    renderHook(() => useCoachTour())
    vi.advanceTimersByTime(700)

    expect(startCoachTour).not.toHaveBeenCalled()
  })

  it('does not start before onboarding is complete', () => {
    mockProfile = createMockProfile({ hasCompletedOnboarding: false })
    renderHook(() => useCoachTour())
    vi.advanceTimersByTime(700)

    expect(startCoachTour).not.toHaveBeenCalled()
  })

  it('does not start once the full tour is completed', () => {
    mockProfile = createMockProfile({
      hasCompletedOnboarding: true,
      hasCompletedTour: true,
    })
    renderHook(() => useCoachTour())
    vi.advanceTimersByTime(700)

    expect(startCoachTour).not.toHaveBeenCalled()
  })

  it('does not start when a tour is already active', () => {
    storeState.isActive = true
    renderHook(() => useCoachTour())
    vi.advanceTimersByTime(700)

    expect(startCoachTour).not.toHaveBeenCalled()
  })
})
