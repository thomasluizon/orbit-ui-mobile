import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { TodayHabitsPanel, TodayHeaderRegion } from '@/app/(app)/today-page-view'
import { TodayDateControl } from '@/app/(app)/today-shell'
import type { TodayView } from '@/app/(app)/use-today-page'
import { useUIStore } from '@/stores/ui-store'

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: typeof en
  children?: React.ReactNode
}>

vi.mock('@/components/ui/icons', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/icons')>()),
  ChevronLeft: () => null,
  ChevronRight: () => null,
  MoreVertical: () => null,
}))

vi.mock('@/components/ui/menu', () => ({
  Menu: ({ open, items, onSelect }: any) => open ? (
    <div role="menu">
      {items.map((item: any) => (
        <button key={item.id} role="menuitem" onClick={() => onSelect(item.id)}>{item.label}</button>
      ))}
    </div>
  ) : null,
}))

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
}))

vi.mock('@/components/habits/habit-list', () => ({
  HabitList: function MockHabitList(props: {
    showCompleted?: boolean
    onSeeUpcoming?: () => void
  }) {
    return (
      <div data-testid="today-habit-list" data-show-completed={String(props.showCompleted)}>
        {props.onSeeUpcoming ? (
          <button type="button" onClick={props.onSeeUpcoming}>See upcoming</button>
        ) : null}
      </div>
    )
  },
}))
vi.mock('@/components/habits/bulk-action-bar-v2', () => ({ BulkActionBarV2: () => null }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: () => null }))
vi.mock('@/components/ui/capacity-notice', () => ({
  CapacityNotice: ({ message }: { message: string }) => <div>{message}</div>,
}))

const baseProps = {
  dayName: 'Wednesday',
  numericDate: '08/04/2026',
  isTodaySelected: true,
  nextDisabled: false,
  onGoToPreviousDay: vi.fn(),
  onGoToToday: vi.fn(),
  onGoToNextDay: vi.fn(),
  previousLabel: 'Previous day',
  todayLabel: 'Today',
  nextLabel: 'Next day',
  moreLabel: 'More actions',
  selectLabel: 'Select',
  collapseLabel: 'Collapse all',
  refreshLabel: 'Refresh',
  completedLabel: 'Show completed',
  isFetching: false,
  onToggleSelect: vi.fn(),
  onToggleCollapse: vi.fn(),
  onRefresh: vi.fn(),
  onToggleCompleted: vi.fn(),
}

describe('Hoje date control', () => {
  it('shows the day name over the numeric date', () => {
    render(<TodayDateControl {...baseProps} />)
    expect(screen.getByText('Wednesday')).toBeInTheDocument()
    expect(screen.getByText('08/04/2026')).toBeInTheDocument()
  })

  it('shows the jump only away from today', () => {
    const onGoToToday = vi.fn()
    render(<TodayDateControl {...baseProps} isTodaySelected={false} onGoToToday={onGoToToday} />)
    fireEvent.click(screen.getByText('Today'))
    expect(onGoToToday).toHaveBeenCalledOnce()
  })

  it('disables the forward step at the instance horizon', () => {
    render(<TodayDateControl {...baseProps} nextDisabled />)
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
  })

  it('renders the resolved read-only boundary notice', () => {
    const view = {
      nav: {
        dateStr: '2026-03-31',
        today: '2026-04-08',
        dateNav: { ...baseProps, isTodaySelected: false },
      },
    } as unknown as TodayView

    render(
      <TestIntlProvider locale="en" messages={en}>
        <TodayHeaderRegion view={view} />
      </TestIntlProvider>,
    )

    expect(screen.getByText(en.habits.todayBoundary.readOnly)).toBeInTheDocument()
  })

  it('ignores an upgraded showCompleted true payload when rendering Today', async () => {
    globalThis.localStorage.setItem(
      'orbit-ui-store',
      JSON.stringify({
        state: { activeFilters: {}, activeView: 'today', showCompleted: true },
        version: 4,
      }),
    )
    await useUIStore.persist.rehydrate()

    const view = {
      data: { filters: {} },
      habitListRef: { current: null },
      isSelectMode: false,
      nav: {
        selectedDate: new Date('2026-04-08T00:00:00'),
        goToNextDay: vi.fn(),
        dateNav: { nextDisabled: false },
      },
      selectedHabitIds: new Set<string>(),
      selection: { handleToggleSelection: vi.fn() },
      setHabitListAllCollapsed: vi.fn(),
      setShowCreateModal: vi.fn(),
      toggleSelectMode: vi.fn(),
    } as unknown as TodayView

    render(<TodayHabitsPanel view={view} />)

    expect(screen.getByTestId('today-habit-list')).toHaveAttribute(
      'data-show-completed',
      'false',
    )
    expect(useUIStore.getState()).not.toHaveProperty('showCompleted')
    globalThis.localStorage.clear()
  })

  it('omits the all-done upcoming action at the instance horizon', () => {
    const goToNextDay = vi.fn()
    const view = {
      data: { filters: {} },
      habitListRef: { current: null },
      isSelectMode: false,
      nav: {
        selectedDate: new Date('2026-07-07T00:00:00'),
        goToNextDay,
        dateNav: { nextDisabled: true },
      },
      selectedHabitIds: new Set<string>(),
      selection: { handleToggleSelection: vi.fn() },
      setHabitListAllCollapsed: vi.fn(),
      setShowCreateModal: vi.fn(),
      toggleSelectMode: vi.fn(),
    } as unknown as TodayView

    render(<TodayHabitsPanel view={view} />)

    expect(screen.queryByRole('button', { name: 'See upcoming' })).not.toBeInTheDocument()
    expect(goToNextDay).not.toHaveBeenCalled()
  })

  it('keeps the all-done upcoming action active below the instance horizon', () => {
    const goToNextDay = vi.fn()
    const view = {
      data: { filters: {} },
      habitListRef: { current: null },
      isSelectMode: false,
      nav: {
        selectedDate: new Date('2026-07-06T00:00:00'),
        goToNextDay,
        dateNav: { nextDisabled: false },
      },
      selectedHabitIds: new Set<string>(),
      selection: { handleToggleSelection: vi.fn() },
      setHabitListAllCollapsed: vi.fn(),
      setShowCreateModal: vi.fn(),
      toggleSelectMode: vi.fn(),
    } as unknown as TodayView

    render(<TodayHabitsPanel view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'See upcoming' }))

    expect(goToNextDay).toHaveBeenCalledOnce()
  })

  it('opens the four list actions from the date row', () => {
    render(<TodayDateControl {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))

    expect(screen.getByRole('menuitem', { name: 'Select' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Collapse all' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Show completed' })).toBeInTheDocument()
  })
})
