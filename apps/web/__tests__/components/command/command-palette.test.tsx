import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

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

interface NormalizedHabitQueryData {
  topLevelHabits: NormalizedHabit[]
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
}

interface HabitsQueryState {
  data?: NormalizedHabitQueryData
  isPending: boolean
  isSuccess: boolean
}

let habitsQuery: HabitsQueryState

function buildQueryData(habits: NormalizedHabit[]): NormalizedHabitQueryData {
  const habitsById = new Map(habits.map((habit) => [habit.id, habit]))
  const childrenByParent = new Map<string, string[]>()
  for (const habit of habits) {
    if (habit.parentId === null) continue
    const siblings = childrenByParent.get(habit.parentId) ?? []
    siblings.push(habit.id)
    childrenByParent.set(habit.parentId, siblings)
  }
  return {
    habitsById,
    childrenByParent,
    topLevelHabits: habits.filter((habit) => habit.parentId === null),
  }
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'command.groups.destinations' ? 'Destinations' : key,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/hooks/use-is-client', () => ({
  useIsClient: () => true,
}))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { setActiveView: typeof mockSetActiveView }) => unknown) =>
    selector({ setActiveView: mockSetActiveView }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => habitsQuery,
  useLogHabit: () => ({ mutate: vi.fn() }),
  useSkipHabit: () => ({ mutate: vi.fn() }),
}))

import {
  CommandPalette,
  CommandPaletteBackground,
} from '@/components/command/command-palette'
import { Sheet } from '@/components/ui/sheet'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useShellStore } from '@/stores/shell-store'

const NavIcon = () => <svg data-testid="nav-icon" />
const navItems = [
  { id: 'hoje', label: 'Today', icon: NavIcon, onSelect: () => mockPush('/') },
  { id: 'calendario', label: 'Calendar', icon: NavIcon, onSelect: () => mockPush('/calendar') },
  { id: 'progresso', label: 'Progress', icon: NavIcon, onSelect: () => mockPush('/progress') },
  { id: 'perfil', label: 'Profile', icon: NavIcon, onSelect: () => mockPush('/profile') },
] as const

function renderPalette() {
  return render(
    <CommandPalette navItems={navItems} onCreateHabit={vi.fn()} />,
  )
}

beforeEach(() => {
  mockSetPaletteOpen.mockImplementation((value: boolean) => {
    useShellStore.setState({ paletteOpen: value })
  })
  useShellStore.setState({
    paletteOpen: true,
    setPaletteOpen: mockSetPaletteOpen,
  })
  habitsQuery = {
    data: buildQueryData([
      createMockHabit({ id: 'h1', title: 'Run', emoji: '🏃', isOverdue: true }),
    ]),
    isPending: false,
    isSuccess: true,
  }
  mockPush.mockClear()
  mockSetPaletteOpen.mockClear()
  mockSetActiveView.mockClear()
})

describe('CommandPalette', () => {
  it('renders the search input when the palette is open', () => {
    renderPalette()
    expect(
      screen.getByRole('combobox', { name: 'command.title' }),
    ).toHaveAttribute('placeholder', 'command.placeholder')
  })

  it('names the dialog after the palette title instead of the input placeholder', () => {
    renderPalette()
    expect(screen.getByRole('dialog', { name: 'command.title' })).toBeInTheDocument()
  })

  it('does not render the menu when the palette is closed', () => {
    useShellStore.setState({ paletteOpen: false })
    renderPalette()
    expect(screen.queryByPlaceholderText('command.placeholder')).not.toBeInTheDocument()
  })

  it('runs a navigate command through router.push and closes', () => {
    renderPalette()
    fireEvent.click(screen.getByText('Calendar'))
    expect(mockPush).toHaveBeenCalledWith('/calendar')
    expect(mockSetPaletteOpen).toHaveBeenCalledWith(false)
  })

  it('renders habits, actions, and destinations in that order', () => {
    renderPalette()
    const groups = Array.from(
      document.querySelectorAll<HTMLElement>('[data-command-group]'),
    )

    expect(groups.map((group) => group.dataset.commandGroup)).toEqual([
      'habits',
      'actions',
      'destinations',
    ])
    expect(screen.getByText('Destinations')).toBeInTheDocument()
  })

  it('offers exactly the four shell destinations', () => {
    renderPalette()
    const destinationGroup = document.querySelector<HTMLElement>(
      '[data-command-group="destinations"]',
    )

    expect(destinationGroup).not.toBeNull()
    expect(
      Array.from(destinationGroup?.querySelectorAll('[cmdk-item]') ?? []).map(
        (item) => item.textContent,
      ),
    ).toEqual(['Today', 'Calendar', 'Progress', 'Profile'])
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

  it('backs out of a command page before Escape closes the overlay', () => {
    renderPalette()
    fireEvent.click(screen.getByText('command.logHabit'))

    fireEvent.keyDown(screen.getByPlaceholderText('command.placeholder'), {
      key: 'Escape',
    })

    expect(screen.getByText('command.createHabit')).toBeInTheDocument()
    expect(mockSetPaletteOpen).not.toHaveBeenCalled()
  })

  it('shows the key-hint footer with the back hint only on a sub-page', () => {
    renderPalette()
    expect(screen.getByText('command.hints.navigate')).toBeInTheDocument()
    expect(screen.getByText('command.hints.select')).toBeInTheDocument()
    expect(screen.getByText('command.hints.close')).toBeInTheDocument()
    expect(screen.queryByText('command.hints.back')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('command.logHabit'))

    expect(screen.queryByText('command.hints.close')).not.toBeInTheDocument()
    expect(screen.getAllByText('command.hints.back')).toHaveLength(2)
  })

  it('does not open over a Sheet that already owns modal focus', async () => {
    function SheetFirstHarness() {
      const [sheetOpen, setSheetOpen] = useState(true)
      useKeyboardShortcuts()
      return (
        <>
          {sheetOpen ? (
            <Sheet title="Sheet owner" onClose={() => setSheetOpen(false)}>
              <button type="button" autoFocus>Sheet action</button>
            </Sheet>
          ) : null}
          <CommandPalette navItems={navItems} onCreateHabit={vi.fn()} />
        </>
      )
    }

    useShellStore.setState({ paletteOpen: false })
    render(<SheetFirstHarness />)
    const sheetDialog = await screen.findByRole('dialog', { name: 'Sheet owner' })

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })

    expect(useShellStore.getState().paletteOpen).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'command.title' })).not.toBeInTheDocument()
    expect(sheetDialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('yields focus and Escape to a Sheet opened above the palette', async () => {
    function PaletteFirstHarness() {
      const [sheetOpen, setSheetOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setSheetOpen(true)}>Open sheet</button>
          <CommandPalette navItems={navItems} onCreateHabit={vi.fn()} />
          {sheetOpen ? (
            <Sheet title="Sheet owner" onClose={() => setSheetOpen(false)}>
              <button type="button">Sheet action</button>
            </Sheet>
          ) : null}
        </>
      )
    }

    render(<PaletteFirstHarness />)
    const paletteInput = screen.getByPlaceholderText('command.placeholder')
    await waitFor(() => expect(paletteInput).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: 'Open sheet' }))
    const sheetDialog = await screen.findByRole('dialog', { name: 'Sheet owner' })
    await waitFor(() =>
      expect(sheetDialog).toContainElement(document.activeElement as HTMLElement),
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sheet owner' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'command.title' })).toBeInTheDocument()
    expect(mockSetPaletteOpen).not.toHaveBeenCalledWith(false)
    await waitFor(() => expect(paletteInput).toHaveFocus())

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockSetPaletteOpen).toHaveBeenCalledWith(false)
  })

  it('returns from a sub-page through the breadcrumb back button', () => {
    renderPalette()
    fireEvent.click(screen.getByText('command.skipHabit'))
    expect(screen.queryByText('command.createHabit')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.back'))

    expect(screen.getByText('command.createHabit')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('command.placeholder')).toHaveFocus()
  })

  it('drops isolation and closes the palette when upgrade removes its owner', async () => {
    const route = (pathname: '/' | '/upgrade') => (
      <CommandPaletteBackground>
        <main>{pathname}</main>
        {pathname === '/' ? (
          <CommandPalette navItems={navItems} onCreateHabit={vi.fn()} />
        ) : null}
      </CommandPaletteBackground>
    )
    const { rerender } = render(
      route('/'),
    )
    const background = document.querySelector('[data-command-palette-background]')

    expect(background).toHaveAttribute('inert')
    expect(background).toHaveAttribute('aria-hidden', 'true')

    rerender(route('/upgrade'))

    await waitFor(() => {
      expect(background).not.toHaveAttribute('inert')
      expect(background).not.toHaveAttribute('aria-hidden')
      expect(useShellStore.getState().paletteOpen).toBe(false)
    })

    rerender(route('/'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(background).not.toHaveAttribute('inert')
  })

  it('does not expose the removed create goal command', () => {
    renderPalette()

    expect(screen.queryByText('command.createGoal')).not.toBeInTheDocument()
  })

  it('does not claim no results while the habits query is still loading', () => {
    habitsQuery = { data: undefined, isPending: true, isSuccess: false }
    renderPalette()
    fireEvent.click(screen.getByText('command.logHabit'))

    expect(screen.queryByText('command.empty')).not.toBeInTheDocument()
    expect(screen.queryByText('Run')).not.toBeInTheDocument()
  })

  it('focuses the search input on open and keeps Tab inside the panel', async () => {
    renderPalette()
    const input = screen.getByPlaceholderText('command.placeholder')
    await waitFor(() => expect(input).toHaveFocus())

    fireEvent.keyDown(document, { key: 'Tab' })

    expect(input).toHaveFocus()
  })

  it('restores focus to the previously focused element on close', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { rerender } = renderPalette()
    await waitFor(() =>
      expect(screen.getByPlaceholderText('command.placeholder')).toHaveFocus(),
    )

    useShellStore.setState({ paletteOpen: false })
    rerender(<CommandPalette navItems={navItems} onCreateHabit={vi.fn()} />)

    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
