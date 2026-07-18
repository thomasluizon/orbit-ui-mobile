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

const motionScroll = vi.hoisted(() => ({
  handler: undefined as ((value: number) => void) | undefined,
}))

vi.mock('motion/react', () => ({
  useScroll: () => ({ scrollY: { get: () => window.scrollY } }),
  useMotionValueEvent: (
    _value: unknown,
    _event: string,
    handler: (value: number) => void,
  ) => {
    motionScroll.handler = handler
  },
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

describe('TourProvider session lifecycle', () => {
  beforeEach(() => {
    useTourStore.getState().endTour()
    useTourStore.getState().setHiddenSections([])
    mockRouterPush.mockClear()
    mockInject.mockClear()
    mockRestore.mockClear()
    mockPathname = '/'
    mockProfile = createMockProfile({ hasProAccess: true })
    stubMatchMedia(false)
  })

  it('injects tour mock data on activation and restores it when the tour ends', () => {
    render(<TourProvider />)

    act(() => {
      useTourStore.getState().startSectionReplay('habits')
    })
    expect(mockInject).toHaveBeenCalledTimes(1)

    act(() => {
      useTourStore.getState().endTour()
    })
    expect(mockRestore).toHaveBeenCalledTimes(1)
  })

  it('remeasures the spotlight target on scroll while the tour is active', async () => {
    render(<TourProvider />)

    act(() => {
      useTourStore.getState().startSectionReplay('habits')
    })
    const step = useTourStore.getState().getCurrentStep()
    expect(step).toBeTruthy()

    const target = document.createElement('div')
    target.setAttribute('data-tour', step!.targetId)
    document.body.appendChild(target)

    act(() => {
      useTourStore.getState().setTargetRect(null)
    })

    await act(async () => {
      motionScroll.handler?.(120)
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })

    expect(useTourStore.getState().targetRect).not.toBeNull()
    target.remove()
  })
})
