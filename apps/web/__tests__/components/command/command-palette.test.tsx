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
let paletteOpen = true

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
  useHabits: () => habitsQuery,
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
    expect(screen.getByPlaceholderText('command.placeholder')).toBeInTheDocument()
  })

  it('names the dialog after the palette title instead of the input placeholder', () => {
    renderPalette()
    expect(screen.getByRole('dialog', { name: 'command.title' })).toBeInTheDocument()
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

  it('shows the key-hint footer with the back hint only on a sub-page', () => {
    renderPalette()
    expect(screen.getByText('command.hints.navigate')).toBeInTheDocument()
    expect(screen.getByText('command.hints.select')).toBeInTheDocument()
    expect(screen.getByText('command.hints.close')).toBeInTheDocument()
    expect(screen.queryByText('command.hints.back')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('command.logHabit'))

    expect(screen.getByText('command.hints.back')).toBeInTheDocument()
  })

  it('returns from a sub-page through the breadcrumb back button', () => {
    renderPalette()
    fireEvent.click(screen.getByText('command.skipHabit'))
    expect(screen.queryByText('command.createHabit')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.back'))

    expect(screen.getByText('command.createHabit')).toBeInTheDocument()
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

    paletteOpen = false
    rerender(<CommandPalette navItems={navItems} onCreateHabit={vi.fn()} onCreateGoal={vi.fn()} />)

    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
