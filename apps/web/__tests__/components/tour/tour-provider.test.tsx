import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'
import { useTourStore } from '@/stores/tour-store'

const mockRouterPush = vi.fn()
let mockPathname = '/'
let mockProfile: Profile | undefined
const mockInject = vi.fn()
const mockRestore = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => mockPathname,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
}))

vi.mock('@/hooks/use-tour-mock-data', () => ({
  useTourMockData: () => ({ inject: mockInject, restore: mockRestore }),
}))

import { TourProvider } from '@/components/tour/tour-provider'

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function advanceToRetrospectiveStep() {
  act(() => {
    useTourStore.getState().startSectionReplay('profile')
  })
  act(() => {
    useTourStore.getState().nextStep()
  })
  act(() => {
    useTourStore.getState().nextStep()
  })
  mockRouterPush.mockClear()
  act(() => {
    useTourStore.getState().nextStep()
  })
  expect(useTourStore.getState().getCurrentStep()?.id).toBe('profile-retrospective')
}

describe('TourProvider step routing', () => {
  beforeEach(() => {
    useTourStore.getState().endTour()
    useTourStore.getState().setHiddenSections([])
    mockRouterPush.mockClear()
    mockPathname = '/'
    mockProfile = createMockProfile({ hasProAccess: true })
  })

  it('routes the profile-retrospective step to /explore at the desktop breakpoint', () => {
    stubMatchMedia(true)
    render(<TourProvider />)

    advanceToRetrospectiveStep()

    expect(mockRouterPush).toHaveBeenCalledTimes(1)
    expect(mockRouterPush).toHaveBeenCalledWith('/explore')
  })

  it('keeps the profile-retrospective step on /profile at phone widths', () => {
    stubMatchMedia(false)
    render(<TourProvider />)

    advanceToRetrospectiveStep()

    expect(mockRouterPush).toHaveBeenCalledTimes(1)
    expect(mockRouterPush).toHaveBeenCalledWith('/profile')
  })

  it('keeps other profile steps on /profile at the desktop breakpoint', () => {
    stubMatchMedia(true)
    render(<TourProvider />)

    act(() => {
      useTourStore.getState().startSectionReplay('profile')
    })

    expect(useTourStore.getState().getCurrentStep()?.id).toBe('profile-streak')
    expect(mockRouterPush).toHaveBeenCalledWith('/profile')
  })
})
