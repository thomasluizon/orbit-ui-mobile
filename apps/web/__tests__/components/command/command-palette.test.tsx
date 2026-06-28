import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

Element.prototype.scrollIntoView = vi.fn()

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

const mockPush = vi.fn()
const mockSetPaletteOpen = vi.fn()
const mockSetActiveView = vi.fn()
let paletteOpen = true

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/hooks/use-is-client', () => ({
  useIsClient: () => true,
}))

vi.mock('@/stores/shell-store', () => ({
  useShellStore: (selector: (state: { paletteOpen: boolean; setPaletteOpen: typeof mockSetPaletteOpen }) => unknown) =>
    selector({ paletteOpen, setPaletteOpen: mockSetPaletteOpen }),
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { setActiveView: typeof mockSetActiveView }) => unknown) =>
    selector({ setActiveView: mockSetActiveView }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ data: { topLevelHabits: [{ id: 'h1', title: 'Run', emoji: '🏃' }] } }),
  useLogHabit: () => ({ mutate: vi.fn() }),
  useSkipHabit: () => ({ mutate: vi.fn() }),
}))

import { CommandPalette } from '@/components/command/command-palette'

const NavIcon = () => <svg data-testid="nav-icon" />
const navItems = [
  { id: 'calendar', label: 'Calendar', icon: NavIcon, onSelect: () => mockPush('/calendar') },
]

function renderPalette() {
  return render(
    <CommandPalette navItems={navItems} onCreateHabit={vi.fn()} onCreateGoal={vi.fn()} />,
  )
}

beforeEach(() => {
  paletteOpen = true
  mockPush.mockClear()
  mockSetPaletteOpen.mockClear()
  mockSetActiveView.mockClear()
})

describe('CommandPalette', () => {
  it('renders the search input when the palette is open', () => {
    renderPalette()
    expect(screen.getByPlaceholderText('command.placeholder')).toBeInTheDocument()
  })

  it('does not render the menu when the palette is closed', () => {
    paletteOpen = false
    renderPalette()
    expect(screen.queryByPlaceholderText('command.placeholder')).not.toBeInTheDocument()
  })

  it('runs a navigate command through router.push and closes', () => {
    renderPalette()
    fireEvent.click(screen.getByText('Calendar'))
    expect(mockPush).toHaveBeenCalledWith('/calendar')
    expect(mockSetPaletteOpen).toHaveBeenCalledWith(false)
  })

  it('jumps to a searched habit via router.push', () => {
    renderPalette()
    fireEvent.click(screen.getByText('Run'))
    expect(mockSetActiveView).toHaveBeenCalledWith('today')
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('closes when Escape is pressed', () => {
    renderPalette()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockSetPaletteOpen).toHaveBeenCalledWith(false)
  })
})
