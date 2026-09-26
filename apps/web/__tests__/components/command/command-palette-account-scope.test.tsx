import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { holdAccount, recoverSameAccount, replaceAccountWith } from '@/__tests__/support/account-change'

Element.prototype.scrollIntoView = vi.fn()

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  logHabit: vi.fn(),
  skipHabit: vi.fn(),
  setActiveView: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/hooks/use-is-client', () => ({ useIsClient: () => true }))
vi.mock('@/stores/ui-store', () => ({
  useUIStore: (selector: (state: { setActiveView: typeof mocks.setActiveView }) => unknown) =>
    selector({ setActiveView: mocks.setActiveView }),
}))
vi.mock('@/hooks/use-habit-queries', () => ({ useSearchHabits: () => habitsQuery }))
vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutate: mocks.logHabit, isPending: false }),
  useSkipHabit: () => ({ mutate: mocks.skipHabit, isPending: false }),
}))

import { CommandPalette } from '@/components/command/command-palette'
import { useShellStore } from '@/stores/shell-store'

const NavIcon = () => <svg data-testid="nav-icon" />
const navItems = [{ id: 'hoje', label: 'Today', icon: NavIcon, onSelect: () => mocks.push('/') }] as const

function buildQueryData(habits: NormalizedHabit[]) {
  return {
    habitsById: new Map(habits.map((habit) => [habit.id, habit])),
    childrenByParent: new Map<string, string[]>(),
    topLevelHabits: habits,
  }
}

let habitsQuery: { data?: ReturnType<typeof buildQueryData>; isPending: boolean; isSuccess: boolean }

function renderPalette() {
  return render(<CommandPalette navItems={navItems} onCreateHabit={vi.fn()} />)
}

/** The palette is on its Log page, which is the state that arms Enter to write. */
function openTheLogPage() {
  fireEvent.click(screen.getByText('command.logHabit'))
  expect(screen.getAllByText('command.hints.back')).toHaveLength(1)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  useShellStore.setState({ paletteOpen: true })
  habitsQuery = {
    data: buildQueryData([createMockHabit({ id: 'h1', title: 'Run', emoji: '\u{1F3C3}' })]),
    isPending: false,
    isSuccess: true,
  }
  holdAccount('user-1')
})

afterEach(() => {
  cleanup()
  useShellStore.setState({ paletteOpen: false })
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/** An open palette must drop the previous account's selected command page. */
it('drops the command page so the next account opens a habit instead of logging it', async () => {
  renderPalette()
  openTheLogPage()

  await replaceAccountWith('user-2')

  expect(screen.queryByText('command.hints.back')).not.toBeInTheDocument()
  expect(screen.getByText('command.createHabit')).toBeInTheDocument()

  fireEvent.click(screen.getByText('Run'))

  expect(mocks.logHabit).not.toHaveBeenCalled()
  expect(mocks.push).toHaveBeenCalledWith('/habits/h1')
})

it('keeps the command page when the same account recovers from a rejected refresh', async () => {
  renderPalette()
  openTheLogPage()

  await recoverSameAccount('user-1')

  expect(screen.getAllByText('command.hints.back')).toHaveLength(1)

  fireEvent.click(screen.getByText('Run'))

  expect(mocks.logHabit).toHaveBeenCalledWith(
    { habitId: 'h1', intent: 'log' },
    expect.anything(),
  )
  expect(mocks.push).not.toHaveBeenCalled()
})
