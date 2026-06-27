import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'

const TestRenderer = require('react-test-renderer')

let mockProfile: Profile | undefined
const startCoachTour = vi.fn()
const storeState = { isActive: false, startCoachTour }
const asyncStore: Record<string, string> = {}

vi.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    callback()
  },
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStore[key] ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStore[key] = value
    }),
  },
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

vi.mock('@/stores/tour-store', () => ({
  useTourStore: { getState: () => storeState },
}))

import { useCoachTour } from '@/hooks/use-coach-tour'

function HookHost() {
  useCoachTour()
  return null
}

describe('useCoachTour (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    startCoachTour.mockClear()
    storeState.isActive = false
    for (const key of Object.keys(asyncStore)) delete asyncStore[key]
    mockProfile = createMockProfile({
      hasCompletedOnboarding: true,
      hasCompletedTour: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts the coach tour once and records it as seen', async () => {
    TestRenderer.act(() => {
      TestRenderer.create(<HookHost />)
    })
    await vi.advanceTimersByTimeAsync(700)

    expect(startCoachTour).toHaveBeenCalledTimes(1)
    expect(asyncStore['orbit_coach_tour_seen']).toBe('true')
  })

  it('does not start again once it has been seen', async () => {
    asyncStore['orbit_coach_tour_seen'] = 'true'
    TestRenderer.act(() => {
      TestRenderer.create(<HookHost />)
    })
    await vi.advanceTimersByTimeAsync(700)

    expect(startCoachTour).not.toHaveBeenCalled()
  })

  it('does not start before onboarding is complete', async () => {
    mockProfile = createMockProfile({ hasCompletedOnboarding: false })
    TestRenderer.act(() => {
      TestRenderer.create(<HookHost />)
    })
    await vi.advanceTimersByTimeAsync(700)

    expect(startCoachTour).not.toHaveBeenCalled()
  })
})
