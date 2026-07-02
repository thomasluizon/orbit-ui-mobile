import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const mockTogglePalette = vi.fn()
const mockToggleRail = vi.fn()
let isDesktop = true

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/theme-toggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}))

vi.mock('@/components/gamification/streak-badge', () => ({
  StreakBadge: () => <div data-testid="streak-badge" />,
}))

vi.mock('@/components/navigation/notification-bell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { currentStreak: 3 } }),
}))

vi.mock('@/components/goals/use-is-desktop', () => ({
  useIsDesktop: () => isDesktop,
}))

vi.mock('@/stores/shell-store', () => ({
  useShellStore: (
    selector: (state: {
      togglePalette: typeof mockTogglePalette
      railOpen: boolean
      toggleRail: typeof mockToggleRail
    }) => unknown,
  ) => selector({ togglePalette: mockTogglePalette, railOpen: false, toggleRail: mockToggleRail }),
}))

import { DesktopTopbar } from '@/components/shell/desktop-topbar'

beforeEach(() => {
  isDesktop = true
  mockTogglePalette.mockClear()
  mockToggleRail.mockClear()
})

describe('DesktopTopbar', () => {
  it('renders the page title as a heading', () => {
    render(<DesktopTopbar title="Preferences" />)
    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument()
  })

  it('renders the bar shell with the title before the desktop match resolves', () => {
    isDesktop = false
    render(<DesktopTopbar title="Preferences" />)
    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument()
    expect(screen.queryByLabelText('shell.openPalette')).not.toBeInTheDocument()
    expect(screen.queryByTestId('notification-bell')).not.toBeInTheDocument()
  })

  it('opens the command palette from the pointer trigger', () => {
    render(<DesktopTopbar title="" />)
    fireEvent.click(screen.getByLabelText('shell.openPalette'))
    expect(mockTogglePalette).toHaveBeenCalledTimes(1)
  })

  it('shows the rail toggle in the right cluster only when requested', () => {
    const { rerender } = render(<DesktopTopbar title="" />)
    expect(screen.queryByLabelText('shell.openRail')).not.toBeInTheDocument()

    rerender(<DesktopTopbar title="" showRailToggle />)

    fireEvent.click(screen.getByLabelText('shell.openRail'))
    expect(mockToggleRail).toHaveBeenCalledTimes(1)
  })
})
