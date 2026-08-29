import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'
import { useTourStore } from '@/stores/tour-store'
import { useUIStore } from '@/stores/ui-store'

Element.prototype.scrollIntoView = vi.fn()
import {
  ShellScrollerProvider,
  useShellScrollerRegistration,
} from '@/components/shell/shell-scroller-context'

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

function TourHarness() {
  const registerScroller = useShellScrollerRegistration()
  return (
    <div ref={registerScroller} data-testid="tour-shell-scroller">
      <TourProvider />
    </div>
  )
}

function renderTourProvider() {
  return render(
    <ShellScrollerProvider>
      <TourHarness />
    </ShellScrollerProvider>,
  )
}

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

describe('TourProvider step routing', () => {
  beforeEach(() => {
    useTourStore.getState().endTour()
    useTourStore.getState().setHiddenSections([])
    mockRouterPush.mockClear()
    mockPathname = '/'
    mockProfile = createMockProfile({ hasProAccess: true })
  })

  it.each([
    ['desktop', true],
    ['phone', false],
  ])('routes the profile section to /profile at the %s breakpoint', (_name, matches) => {
    stubMatchMedia(matches)
    renderTourProvider()

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
    useUIStore.setState({ searchQuery: '' })
    stubMatchMedia(false)
  })

  it('injects tour mock data on activation and restores it when the tour ends', () => {
    renderTourProvider()

    act(() => {
      useTourStore.getState().startSectionReplay('habits')
    })
    expect(mockInject).toHaveBeenCalledTimes(1)

    act(() => {
      useTourStore.getState().endTour()
    })
    expect(mockRestore).toHaveBeenCalledTimes(1)
  })

  it('restores an active search after the tour ends', () => {
    useUIStore.setState({ searchQuery: 'focus' })
    renderTourProvider()

    act(() => {
      useTourStore.getState().startSectionReplay('habits')
    })
    expect(useUIStore.getState().searchQuery).toBe('')

    act(() => {
      useTourStore.getState().endTour()
    })
    expect(useUIStore.getState().searchQuery).toBe('focus')
  })

  it('remeasures the spotlight target on scroll while the tour is active', async () => {
    renderTourProvider()

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
      screen.getByTestId('tour-shell-scroller').dispatchEvent(new Event('scroll'))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })

    expect(useTourStore.getState().targetRect).not.toBeNull()
    target.remove()
  })
})
