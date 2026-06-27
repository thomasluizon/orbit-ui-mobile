import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'

const TestRenderer = require('react-test-renderer')

let mockProfile: Profile | undefined
const startSectionReplay = vi.fn()
const storeState = { isActive: false, startSectionReplay }
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

import { useCoachMark } from '@/hooks/use-coach-mark'

function HookHost() {
  useCoachMark('coach-today')
  return null
}

describe('useCoachMark (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    startSectionReplay.mockClear()
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

  it('triggers a section replay once for an unseen surface and records it as seen', async () => {
    TestRenderer.act(() => {
      TestRenderer.create(<HookHost />)
    })
    await vi.advanceTimersByTimeAsync(700)

    expect(startSectionReplay).toHaveBeenCalledWith('coach-today')
    expect(asyncStore['orbit_tour_sections']).toContain('coach-today')
  })

  it('does not trigger again once the surface has been seen', async () => {
    asyncStore['orbit_tour_sections'] = JSON.stringify({ 'coach-today': true })
    TestRenderer.act(() => {
      TestRenderer.create(<HookHost />)
    })
    await vi.advanceTimersByTimeAsync(700)

    expect(startSectionReplay).not.toHaveBeenCalled()
  })

  it('does not trigger before onboarding is complete', async () => {
    mockProfile = createMockProfile({ hasCompletedOnboarding: false })
    TestRenderer.act(() => {
      TestRenderer.create(<HookHost />)
    })
    await vi.advanceTimersByTimeAsync(700)

    expect(startSectionReplay).not.toHaveBeenCalled()
  })
})
