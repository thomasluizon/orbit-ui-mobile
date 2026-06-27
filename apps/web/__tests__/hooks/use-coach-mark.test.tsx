import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'

let mockProfile: Profile | undefined
const startSectionReplay = vi.fn()
const storeState = { isActive: false, startSectionReplay }

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

vi.mock('@/stores/tour-store', () => ({
  useTourStore: { getState: () => storeState },
}))

import { useCoachMark } from '@/hooks/use-coach-mark'

describe('useCoachMark', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    startSectionReplay.mockClear()
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

  it('triggers a section replay once for an unseen surface and records it as seen', () => {
    renderHook(() => useCoachMark('coach-today'))
    vi.advanceTimersByTime(700)

    expect(startSectionReplay).toHaveBeenCalledWith('coach-today')
    const seen = JSON.parse(localStorage.getItem('orbit_tour_sections') ?? '{}')
    expect(seen['coach-today']).toBe(true)
  })

  it('does not trigger again once the surface has been seen', () => {
    localStorage.setItem('orbit_tour_sections', JSON.stringify({ 'coach-today': true }))
    renderHook(() => useCoachMark('coach-today'))
    vi.advanceTimersByTime(700)

    expect(startSectionReplay).not.toHaveBeenCalled()
  })

  it('does not trigger before onboarding is complete', () => {
    mockProfile = createMockProfile({ hasCompletedOnboarding: false })
    renderHook(() => useCoachMark('coach-today'))
    vi.advanceTimersByTime(700)

    expect(startSectionReplay).not.toHaveBeenCalled()
  })

  it('does not trigger once the full tour is completed', () => {
    mockProfile = createMockProfile({
      hasCompletedOnboarding: true,
      hasCompletedTour: true,
    })
    renderHook(() => useCoachMark('coach-today'))
    vi.advanceTimersByTime(700)

    expect(startSectionReplay).not.toHaveBeenCalled()
  })
})
