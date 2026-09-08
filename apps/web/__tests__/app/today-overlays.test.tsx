import { Suspense, useState, type ReactNode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TodayHeaderRegion, TodayHabitsPanel, TodayOverlays } from '@/app/(app)/today-page-view'
import type { TodayView } from '@/app/(app)/use-today-page'
import { DestinationShell } from '@/components/shell/destination-shell'

const chunks = vi.hoisted(() => {
  let resolveSelection!: () => void
  let resolveConfirmation!: () => void
  return {
    selection: {
      promise: new Promise<void>((resolve) => { resolveSelection = resolve }),
      resolve: () => resolveSelection(),
    },
    confirmation: {
      promise: new Promise<void>((resolve) => { resolveConfirmation = resolve }),
      resolve: () => resolveConfirmation(),
    },
  }
})

vi.mock('next/dynamic', async () => ({
  default: (await import('next/dist/shared/lib/app-dynamic')).default,
}))
vi.mock('@/components/habits/selection-tray', async (importOriginal) => {
  await chunks.selection.promise
  return importOriginal<typeof import('@/components/habits/selection-tray')>()
})
vi.mock('@/components/ui/confirm-sheet', async (importOriginal) => {
  await chunks.confirmation.promise
  return importOriginal<typeof import('@/components/ui/confirm-sheet')>()
})
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => false }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: vi.fn() }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { name: 'Test', email: 'test@example.com' } }),
}))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/ui/trial-banner', () => ({ TrialBanner: () => null }))
vi.mock('@/components/shell/shell-wide', () => ({ ShellWide: () => null }))
vi.mock('@/components/shell/shell-412', () => ({
  Shell412: ({ children, composer, tabBar }: {
    children: ReactNode
    composer?: ReactNode
    tabBar?: ReactNode
  }) => <main>{children}{composer}{tabBar}</main>,
}))
vi.mock('@/components/habits/habit-list', () => ({
  HabitList: () => <p>Morning walk</p>,
}))

function TodayHarness() {
  const [isSelectMode, setSelectMode] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [selectedHabitIds, setSelectedHabitIds] = useState(new Set(['walk']))
  const [lastAction, setLastAction] = useState('none')
  const view = {
    nav: {
      dateStr: '2026-09-06',
      today: '2026-09-06',
      selectedDate: new Date('2026-09-06T00:00:00'),
      dateNav: {
        dayName: 'Sunday', numericDate: '06/09/2026', isTodaySelected: true,
        nextDisabled: false, previousLabel: 'Previous day', todayLabel: 'Today',
        nextLabel: 'Next day',
      },
    },
    data: { filters: {}, isRefetching: false },
    habitListRef: { current: null },
    isSelectMode,
    selectedHabitIds,
    toggleSelectMode: () => setSelectMode((selected) => !selected),
    selection: {
      allSelected: selectedHabitIds.size === 2,
      selectAll: () => setSelectedHabitIds(new Set(['walk', 'read'])),
      deselectAll: () => setSelectedHabitIds(new Set()),
      showBulkDeleteConfirm,
      setShowBulkDeleteConfirm,
      confirmBulkLog: async () => setLastAction('logged'),
      confirmBulkSkip: async () => setLastAction('skipped'),
      confirmBulkDelete: async () => setLastAction('deleted'),
    },
  } as unknown as TodayView

  return (
    <Suspense fallback={null}>
      <DestinationShell onCreate={vi.fn()} composer={<p>Astra composer</p>}>
        <h1>Today</h1>
        <output aria-label="Last action">{lastAction}</output>
        <TodayHeaderRegion view={view} />
        <TodayHabitsPanel view={view} />
        <TodayOverlays view={view} />
      </DestinationShell>
    </Suspense>
  )
}

function enterSelection() {
  fireEvent.click(screen.getByRole('button', { name: 'habits.actions.more' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'common.select' }))
}

function expectTodayVisible() {
  expect(screen.getByRole('heading', { name: 'Today' })).toBeVisible()
  expect(screen.getByText('Morning walk')).toBeVisible()
  expect(screen.getByRole('button', { name: 'nav.calendar' })).toBeVisible()
}

describe('Today lazy overlays', () => {
  it('keeps Today visible during each first chunk load and preserves the overlay actions', async () => {
    render(<TodayHarness />)
    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Astra composer')).toBeVisible()

    enterSelection()
    try {
      expectTodayVisible()
      expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument()
    } finally {
      await act(async () => { chunks.selection.resolve() })
    }

    const tray = await screen.findByTestId('bulk-action-bar')
    expectTodayVisible()
    fireEvent.click(within(tray).getByRole('button', { name: 'common.cancel' }))
    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument()
    expect(screen.getByText('Astra composer')).toBeVisible()
    enterSelection()
    const reopenedTray = await screen.findByTestId('bulk-action-bar')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(within(reopenedTray).getByRole('button', { name: 'common.selectAll' }))
    fireEvent.click(within(reopenedTray).getByRole('button', { name: 'common.deselectAll' }))
    expect(within(reopenedTray).getByRole('button', { name: 'habits.bulkBar.delete' })).toBeDisabled()
    fireEvent.click(within(reopenedTray).getByRole('button', { name: 'common.selectAll' }))
    fireEvent.click(within(reopenedTray).getByRole('button', { name: 'habits.bulkBar.log' }))
    expect(screen.getByLabelText('Last action')).toHaveTextContent('logged')
    fireEvent.click(within(reopenedTray).getByRole('button', { name: 'habits.bulkBar.skip' }))
    expect(screen.getByLabelText('Last action')).toHaveTextContent('skipped')
    fireEvent.click(within(reopenedTray).getByRole('button', { name: 'habits.bulkBar.delete' }))
    try {
      expectTodayVisible()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    } finally {
      await act(async () => { chunks.confirmation.resolve() })
    }

    const dialog = await screen.findByRole('dialog', { name: 'habits.bulkDeleteTitle' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.cancel' }))
    await screen.findByRole('heading', { name: 'Today' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Last action')).toHaveTextContent('skipped')
    fireEvent.click(within(reopenedTray).getByRole('button', { name: 'habits.bulkBar.delete' }))
    const reopened = await screen.findByRole('dialog', { name: 'habits.bulkDeleteTitle' })
    fireEvent.click(within(reopened).getByRole('button', { name: 'habits.bulkDeleteConfirm' }))
    await screen.findByRole('heading', { name: 'Today' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Last action')).toHaveTextContent('deleted')
  })
})
