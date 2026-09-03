import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const motionTestState = vi.hoisted(() => ({
  animations: [] as Array<{
    from: number
    target: number
    options: { duration?: number; ease?: readonly number[]; onComplete?: () => void }
    stop: ReturnType<typeof vi.fn>
    value: { get: () => number; set: (value: number) => void }
  }>,
  completeAnimations: true,
  reducedMotion: false,
}))

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

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  const ReactModule = await import('react')
  const resolveStyleValue = (value: unknown) => (
    typeof value === 'object' && value !== null && 'get' in value
      ? (value as { get: () => number }).get()
      : value
  )

  return {
    ...actual,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    animate: (
      value: { get: () => number; set: (nextValue: number) => void },
      target: number,
      options: { duration?: number; ease?: readonly number[]; onComplete?: () => void } = {},
    ) => {
      const stop = vi.fn()
      motionTestState.animations.push({
        from: value.get(),
        target,
        options,
        stop,
        value,
      })
      if (motionTestState.completeAnimations) {
        value.set(target)
        options.onComplete?.()
      }
      return { stop }
    },
    motion: {
      div: ({
        children,
        style,
        ...props
      }: {
        children?: React.ReactNode
        style?: { opacity?: unknown; y?: unknown }
        [key: string]: unknown
      }) => ReactModule.createElement('div', {
        ...props,
        'data-motion-y': resolveStyleValue(style?.y),
        style: { opacity: resolveStyleValue(style?.opacity) },
      }, children),
    },
    useReducedMotion: () => motionTestState.reducedMotion,
  }
})

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

function createMotionView(
  dateStr: string,
  isFetching = false,
  isRefetching = isFetching,
): TodayView {
  return {
    data: { filters: {}, isFetching, isRefetching },
    habitListRef: { current: null },
    isSelectMode: false,
    nav: {
      dateStr,
      selectedDate: new Date(`${dateStr}T00:00:00`),
      goToNextDay: vi.fn(),
      dateNav: { nextDisabled: false },
    },
    selectedHabitIds: new Set<string>(),
    selection: { handleToggleSelection: vi.fn() },
    setHabitListAllCollapsed: vi.fn(),
    setListSurfaceOpen: vi.fn(),
    setShowCreateModal: vi.fn(),
    setShowCompleted: vi.fn(),
    showCompleted: false,
    toggleSelectMode: vi.fn(),
  } as unknown as TodayView
}

describe('Hoje date control', () => {
  beforeEach(() => {
    motionTestState.animations.length = 0
    motionTestState.completeAnimations = true
    motionTestState.reducedMotion = false
  })

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

  it('keeps the date arrows on the control hover token and duration', () => {
    render(<TodayDateControl {...baseProps} />)

    for (const name of ['Previous day', 'Next day']) {
      const className = screen.getByRole('button', { name }).className
      expect(className).toContain('hover:bg-[var(--bg-hover)]')
      expect(className).toContain('var(--dur-hover-control)')
    }
  })

  it('renders the resolved read-only boundary notice', () => {
    const view = {
      data: { isFetching: false, refetch: vi.fn() },
      habitListAllCollapsed: false,
      habitListRef: { current: null },
      isSelectMode: false,
      nav: {
        dateStr: '2026-03-31',
        today: '2026-04-08',
        dateNav: { ...baseProps, isTodaySelected: false },
      },
      setShowCompleted: vi.fn(),
      showCompleted: false,
      toggleSelectMode: vi.fn(),
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
      setShowCompleted: vi.fn(),
      showCompleted: false,
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
      setShowCompleted: vi.fn(),
      showCompleted: false,
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
      setShowCompleted: vi.fn(),
      showCompleted: false,
      toggleSelectMode: vi.fn(),
    } as unknown as TodayView

    render(<TodayHabitsPanel view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'See upcoming' }))

    expect(goToNextDay).toHaveBeenCalledOnce()
  })

  it('applies interruptible day and refetch motion at the HabitList boundary', () => {
    motionTestState.completeAnimations = false
    const { rerender } = render(<TodayHabitsPanel view={createMotionView('2026-04-08')} />)
    const refetchWrapper = screen.getByTestId('today-refetch-motion')
    const dayWrapper = screen.getByTestId('today-day-motion')

    expect(refetchWrapper).toContainElement(dayWrapper)
    expect(dayWrapper).toContainElement(screen.getByTestId('today-habit-list'))
    motionTestState.animations.length = 0

    rerender(<TodayHabitsPanel view={createMotionView('2026-04-09')} />)
    const firstDayShift = motionTestState.animations.find((entry) => (
      entry.from === 8 && entry.target === 0
    ))
    expect(firstDayShift?.options).toMatchObject({
      duration: 0.22,
      ease: [0.16, 1, 0.3, 1],
    })
    firstDayShift?.value.set(3)
    motionTestState.animations.length = 0

    rerender(<TodayHabitsPanel view={createMotionView('2026-04-10')} />)
    expect(motionTestState.animations).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 3, target: 0 }),
    ]))
    motionTestState.animations.length = 0

    rerender(<TodayHabitsPanel view={createMotionView('2026-04-10', true)} />)
    expect(motionTestState.animations).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 1, target: 0.8 }),
      expect.objectContaining({ from: 0, target: 4 }),
    ]))
  })

  it('does not apply refetch motion during a cold client fetch', () => {
    motionTestState.completeAnimations = false

    render(<TodayHabitsPanel view={createMotionView('2026-04-08', true, false)} />)

    expect(motionTestState.animations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 0.8 }),
      expect.objectContaining({ target: 4 }),
    ]))
  })

  it('keeps reduced Today motion directional-static with reduced timings', () => {
    motionTestState.completeAnimations = false
    motionTestState.reducedMotion = true
    const { rerender } = render(<TodayHabitsPanel view={createMotionView('2026-04-08')} />)
    motionTestState.animations.length = 0

    rerender(<TodayHabitsPanel view={createMotionView('2026-04-09')} />)
    expect(motionTestState.animations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: 0,
        target: 0,
        options: expect.objectContaining({ duration: 0.09, ease: [0, 0, 1, 1] }),
      }),
    ]))
    motionTestState.animations.length = 0

    rerender(<TodayHabitsPanel view={createMotionView('2026-04-09', true)} />)
    expect(motionTestState.animations).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 1, target: 0.8 }),
      expect.objectContaining({
        from: 0,
        target: 0,
        options: expect.objectContaining({ duration: 0.09 }),
      }),
    ]))
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
