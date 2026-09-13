import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import {
  buildCalendarMonthModel,
  CALENDAR_MONTH_GRID_RESERVED_DAY_HEIGHT,
  formatAPIDate,
  formatAPIDateInTimeZone,
} from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

let isWideDesktopValue = false
let calendarGridSelectionDate = '2026-01-05'
const calendarGridProps: Record<string, unknown> & {
  currentMonth?: Date
  dayMap?: Map<string, CalendarDayEntry[]>
  selectedDateStr?: string | null
  todayKey?: string
} = {}
const calendarStatsProps: Record<string, unknown> = {}
const monthQueryState: {
  dayMap: Map<string, CalendarDayEntry[]>
  error: string | null
  isLoading: boolean
  refresh: ReturnType<typeof vi.fn>
} = {
  dayMap: new Map(),
  error: null,
  isLoading: false,
  refresh: vi.fn(),
}
const profileQueryState: {
  profile: { weekStartDay: number; timeZone: string | null } | undefined
  error: Error | null
  refetch: ReturnType<typeof vi.fn>
} = {
  profile: { weekStartDay: 1, timeZone: 'UTC' },
  error: null,
  refetch: vi.fn(),
}
const calendarDataCalls = vi.fn()
const agendaViewProps: {
  dayMap?: ReadonlyMap<string, CalendarDayEntry[]>
  isLoading?: boolean
} = {}
let rangeLoading = false
let rangeDayMap = new Map<string, CalendarDayEntry[]>()
const calendarRangeViewProps: { current: Record<string, unknown> | null } = { current: null }

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-is-desktop', () => ({
  useIsWideDesktop: () => isWideDesktopValue,
}))

vi.mock('@/hooks/use-calendar-data', () => ({
  useCalendarData: (month: Date) => {
    calendarDataCalls(month)
    return ({
    dayMap: monthQueryState.dayMap,
    isLoading: monthQueryState.isLoading,
    isFetching: false,
    error: monthQueryState.error,
    refresh: monthQueryState.refresh,
    })
  },
  useCalendarRange: () => ({
    dayMap: rangeDayMap,
    isLoading: rangeLoading,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (time: string) => time }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => profileQueryState,
}))

vi.mock('@/app/(app)/today-provider', () => ({
  useToday: (timeZone?: string | null) => {
    const today = new Date()
    return timeZone === undefined
      ? formatAPIDate(today)
      : formatAPIDateInTimeZone(today, timeZone)
  },
}))

vi.mock('@/components/ui/section-label', () => ({
  SectionLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
}))

vi.mock('./_components/calendar-shell', () => ({
  CalendarHeader: ({ onNextMonth }: { onNextMonth: () => void }) => (
    <button type="button" data-testid="calendar-header" onClick={onNextMonth} />
  ),
  CalendarLegend: () => <div data-testid="calendar-legend" />,
  CalendarWeekNav: () => <div data-testid="calendar-week-nav" />,
}))

vi.mock('@/app/(app)/calendar/_components/calendar-shell', () => ({
  CalendarHeader: ({ onNextMonth }: { onNextMonth: () => void }) => (
    <button type="button" data-testid="calendar-header" onClick={onNextMonth} />
  ),
  CalendarLegend: () => <div data-testid="calendar-legend" />,
  CalendarWeekNav: () => <div data-testid="calendar-week-nav" />,
}))

vi.mock('@/components/calendar/calendar-grid', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/calendar/calendar-grid')>()
  const ActualCalendarGrid = actual.CalendarGrid
  return {
    CalendarGrid: (props: {
      onSelectDay?: (dateStr: string) => void
      selectedDateStr?: string | null
      [key: string]: unknown
    }) => {
      Object.assign(calendarGridProps, props)
      return (
        <>
          <ActualCalendarGrid {...(props as React.ComponentProps<typeof ActualCalendarGrid>)} />
          <button
            type="button"
            data-testid="month-view"
            onClick={() => props.onSelectDay?.(calendarGridSelectionDate)}
          />
        </>
      )
    },
  }
})

vi.mock('@/components/calendar/calendar-stats', () => ({
  CalendarStats: (props: Record<string, unknown>) => {
    Object.assign(calendarStatsProps, props)
    const stats = props.stats as readonly { key: string; value: string | number }[]
    return (
      <div data-testid="month-stats" data-state={String(props.state)}>
        {stats.map((stat) => <span key={stat.key}>{`${stat.key}:${stat.value}`}</span>)}
      </div>
    )
  },
}))

vi.mock('@/components/calendar/calendar-day-detail', () => ({
  CalendarDayDetail: ({
    onShowRecurringChange,
    showRecurring,
    showRecurringToggle = true,
  }: {
    onShowRecurringChange: (value: boolean) => void
    showRecurring: boolean
    showRecurringToggle?: boolean
  }) => (
    <div data-testid="day-detail">
      {showRecurringToggle && (
        <button
          type="button"
          role="switch"
          aria-checked={showRecurring}
          aria-label="calendar.showRecurring"
          onClick={() => onShowRecurringChange(!showRecurring)}
        />
      )}
    </div>
  ),
}))

vi.mock('@/components/calendar/calendar-week-view', () => ({
  CalendarWeekView: ({
    onShowRecurringChange,
  }: {
    onShowRecurringChange: (value: boolean) => void
  }) => (
    <button
      type="button"
      data-testid="week-view"
      onClick={() => onShowRecurringChange(false)}
    />
  ),
}))

vi.mock('@/components/calendar/calendar-range-view', () => ({
  CalendarRangeView: (props: Record<string, unknown>) => {
    calendarRangeViewProps.current = props
    const model = props.model as { days: readonly { totalCount: number }[] }
    const showRecurring = props.showRecurring as boolean
    const onShowRecurringChange = props.onShowRecurringChange as (value: boolean) => void
    return (
      <div data-testid="range-view">
        {model.days.some((day) => day.totalCount > 0) && (
          <span data-testid="range-recurring-ring" />
        )}
        <button
          type="button"
          role="switch"
          aria-checked={showRecurring}
          aria-label="calendar.showRecurring"
          onClick={() => onShowRecurringChange(!showRecurring)}
        />
      </div>
    )
  },
}))

vi.mock('@/components/calendar/calendar-agenda-view', () => ({
  CalendarAgendaView: (props: {
    dayMap: ReadonlyMap<string, CalendarDayEntry[]>
    isLoading: boolean
  }) => {
    agendaViewProps.dayMap = props.dayMap
    agendaViewProps.isLoading = props.isLoading
    return <div data-testid="agenda-view" />
  },
}))

import CalendarPage from '@/app/(app)/calendar/page'

function monthEntry(habitId: string, status: CalendarDayEntry['status']): CalendarDayEntry {
  return {
    habitId,
    title: 'Habit',
    status,
    isBadHabit: false,
    dueTime: null,
    isOneTime: false,
  }
}

function setBoundaryEntries(firstDay: string, secondDay: string) {
  monthQueryState.dayMap = new Map([
    [firstDay, [monthEntry('first', 'completed')]],
    [secondDay, [monthEntry('second', 'completed'), monthEntry('missed', 'upcoming')]],
  ])
}

describe('CalendarPage view switcher', () => {
  beforeEach(() => {
    isWideDesktopValue = false
    calendarGridSelectionDate = '2026-01-05'
    calendarGridProps.selectedDateStr = undefined
    calendarGridProps.dayMap = undefined
    calendarGridProps.todayKey = undefined
    calendarStatsProps.state = undefined
    monthQueryState.dayMap = new Map()
    monthQueryState.error = null
    monthQueryState.isLoading = false
    monthQueryState.refresh = vi.fn()
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC' }
    profileQueryState.error = null
    profileQueryState.refetch = vi.fn()
    calendarDataCalls.mockClear()
    agendaViewProps.dayMap = undefined
    agendaViewProps.isLoading = undefined
    rangeLoading = false
    rangeDayMap = new Map()
    calendarRangeViewProps.current = null
  })

  afterEach(() => vi.useRealTimers())

  it('loads calendar data concurrently while the profile resolves', () => {
    profileQueryState.profile = undefined
    render(<CalendarPage />)

    expect(calendarDataCalls).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('progressbar', { name: 'calendar.loading' })).toHaveLength(2)
    expect(document.querySelector('[data-variant="grid"] > [data-cell="44"]')).toHaveAttribute('data-gap', '4')
  })

  it.each([
    ['Monday-first five-row', new Date(2026, 8, 11), 1, 5],
    ['Monday-first six-row', new Date(2026, 7, 11), 1, 6],
    ['Sunday-first six-row', new Date(2026, 4, 11), 0, 6],
  ] as const)('keeps the %s profile-loading grid at the loaded month height', (_label, now, weekStartDay, expectedRows) => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    profileQueryState.profile = undefined
    const { rerender } = render(<CalendarPage />)
    const loadingRows = Number(document.querySelector('[data-variant="grid"] > [data-rows]')?.getAttribute('data-rows'))
    const loadingHeight = loadingRows * 44 + (loadingRows - 1) * 4

    profileQueryState.profile = { weekStartDay, timeZone: 'UTC' }
    rerender(<CalendarPage />)
    const loadedMonth = calendarGridProps.currentMonth as Date
    const loadedRows = buildCalendarMonthModel(
      loadedMonth,
      new Map(),
      weekStartDay,
      formatAPIDate(now),
    ).gridDays.length / 7
    const loadedHeight = Number(screen.getByTestId('month-grid-days').style.minHeight.replace('px', ''))

    expect(loadedRows).toBe(expectedRows)
    expect(loadingHeight).toBe(loadedHeight)
    expect(loadedHeight).toBe(CALENDAR_MONTH_GRID_RESERVED_DAY_HEIGHT)
  })

  it('shows a retryable error when the profile request fails', () => {
    profileQueryState.profile = undefined
    profileQueryState.error = new Error('profile unavailable')
    render(<CalendarPage />)

    expect(screen.getByText('calendar.loadError')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(profileQueryState.refetch).toHaveBeenCalledTimes(1)
  })

  it('renders the agenda at phone width without folding it back to month', () => {
    render(<CalendarPage />)

    expect(screen.getAllByRole('radiogroup', { name: 'calendar.view.switchLabel' })).toHaveLength(1)
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getByRole('radio', { name: 'calendar.view.month' }).getAttribute('aria-checked')).toBe('true')
    expect(calendarGridProps.selectedDateStr).toBe(formatAPIDate(new Date()))

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.agenda' }))

    expect(screen.getByRole('radio', { name: 'calendar.view.agenda' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('agenda-view')).toBeDefined()
    expect(screen.queryByTestId('month-view')).toBeNull()
  })

  it('marks today in the account timezone when the browser-local date differs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-12T01:30:00.000Z'))
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'Pacific/Kiritimati' }
    try {
      render(<CalendarPage />)

      expect(calendarGridProps.todayKey).toBe('2026-09-12')
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    {
      name: 'device date is one day ahead',
      deviceTimeZone: 'Pacific/Kiritimati',
      accountTimeZone: 'America/Los_Angeles',
      now: '2026-09-12T10:30:00.000Z',
      firstDay: '2026-09-12',
      secondDay: '2026-09-13',
      expected: ['bestStreak:1', 'totalLogs:1', 'missed:0'],
    },
    {
      name: 'device date is one day behind',
      deviceTimeZone: 'America/Los_Angeles',
      accountTimeZone: 'UTC',
      now: '2026-09-12T00:30:00.000Z',
      firstDay: '2026-09-11',
      secondDay: '2026-09-12',
      expected: ['bestStreak:2', 'totalLogs:2', 'missed:1'],
    },
  ])('renders statistics through the account date when $name', ({
    deviceTimeZone,
    accountTimeZone,
    now,
    firstDay,
    secondDay,
    expected,
  }) => {
    const originalTimeZone = process.env.TZ
    process.env.TZ = deviceTimeZone
    vi.useFakeTimers()
    vi.setSystemTime(new Date(now))
    profileQueryState.profile = { weekStartDay: 1, timeZone: accountTimeZone }
    setBoundaryEntries(firstDay, secondDay)
    try {
      render(<CalendarPage />)

      for (const figure of expected) expect(screen.getByText(figure)).toBeDefined()
    } finally {
      vi.useRealTimers()
      if (originalTimeZone === undefined) delete process.env.TZ
      else process.env.TZ = originalTimeZone
    }
  })

  it('keeps the agenda option at desktop width', () => {
    render(<CalendarPage />)

    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getAllByRole('radio', { name: 'calendar.view.agenda' })).toHaveLength(1)
  })

  it('switches from the month view to the agenda list and back', () => {
    render(<CalendarPage />)

    expect(screen.getByTestId('month-view')).toBeDefined()
    expect(screen.queryByTestId('agenda-view')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.agenda' }))

    expect(screen.getByTestId('agenda-view')).toBeDefined()
    expect(screen.queryByTestId('month-view')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.month' }))

    expect(screen.getByTestId('month-view')).toBeDefined()
    expect(screen.queryByTestId('agenda-view')).toBeNull()
  })

  it('passes the range loading state to the agenda view', () => {
    rangeLoading = true
    render(<CalendarPage />)

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.agenda' }))

    expect(agendaViewProps.isLoading).toBe(true)
  })

  it('shows all agenda habits after recurring entries are hidden in another view', () => {
    const today = formatAPIDate(new Date())
    rangeDayMap = new Map([
      [today, [
        monthEntry('recurring', 'upcoming'),
        { ...monthEntry('one-time', 'upcoming'), isOneTime: true },
      ]],
    ])
    render(<CalendarPage />)

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.week' }))
    fireEvent.click(screen.getByTestId('week-view'))
    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.agenda' }))

    expect(agendaViewProps.dayMap?.get(today)?.map((entry) => entry.habitId)).toEqual([
      'recurring',
      'one-time',
    ])
  })

  it('switches to the week and range time-grid views', () => {
    render(<CalendarPage />)

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.week' }))
    expect(screen.getByTestId('week-view')).toBeDefined()

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.range' }))
    expect(screen.getByTestId('range-view')).toBeDefined()
  })

  it('passes the pending range state through the owning composition', () => {
    rangeLoading = true
    const view = render(<CalendarPage />)

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.range' }))
    expect(calendarRangeViewProps.current?.isLoading).toBe(true)

    rangeLoading = false
    view.rerender(<CalendarPage />)
    expect(calendarRangeViewProps.current?.isLoading).toBe(false)
  })

  it('keeps exactly one recurring setting on an entry-bearing future day at wide desktop', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 10))
    isWideDesktopValue = true
    const todayKey = formatAPIDate(new Date())
    const futureDay = '2026-02-05'
    calendarGridSelectionDate = futureDay
    monthQueryState.dayMap = new Map([
      [todayKey, [monthEntry('current-recurring', 'upcoming')]],
      [futureDay, [monthEntry('future-recurring', 'upcoming')]],
    ])
    render(<CalendarPage />)

    expect(screen.getByTestId('calendar-day-panel')).toBeDefined()
    expect(screen.getByTestId('day-detail')).toBeDefined()
    expect(screen.getAllByRole('switch', { name: 'calendar.showRecurring' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('switch', { name: 'calendar.showRecurring' }))
    fireEvent.click(screen.getByTestId('calendar-header'))
    fireEvent.click(screen.getByTestId('month-view'))

    expect(calendarGridProps.currentMonth).toEqual(new Date(2026, 1, 1))
    expect(calendarGridProps.selectedDateStr).toBe(futureDay)
    expect(screen.getAllByRole('switch', { name: 'calendar.showRecurring' })).toHaveLength(1)
  })

  it('opens the day detail as an overlay below the wide-desktop breakpoint', () => {
    render(<CalendarPage />)

    expect(screen.queryByTestId('calendar-day-panel')).toBeNull()
    expect(screen.queryByTestId('day-detail')).toBeNull()

    fireEvent.click(screen.getByTestId('month-view'))
    expect(screen.getByTestId('day-detail')).toBeDefined()
  })

  it('keeps the calendar usable and offers habit creation for an empty current month', () => {
    render(<CalendarPage />)

    expect(screen.getByTestId('month-view')).toBeDefined()
    expect(screen.getByTestId('calendar-header')).toBeDefined()
    expect(screen.getByText('calendar.emptyMonth')).toBeDefined()
    expect(screen.getByRole('button', { name: 'habits.createHabit' })).toBeDefined()
    expect(screen.queryByTestId('calendar-legend')).toBeNull()
    expect(calendarStatsProps.state).toBe('empty')
  })

  it('keeps paging available but removes creation for a future month', () => {
    render(<CalendarPage />)

    fireEvent.click(screen.getByTestId('calendar-header'))

    expect(screen.getByTestId('month-view')).toBeDefined()
    expect(screen.getByText('calendar.futureMonth')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'habits.createHabit' })).toBeNull()
    expect(calendarStatsProps.state).toBe('empty')
  })

  it('keeps compact loading shaped like the grid and stat tiles', () => {
    monthQueryState.isLoading = true
    render(<CalendarPage />)

    expect(calendarGridProps.isLoading).toBe(true)
    expect(screen.queryByTestId('calendar-day-loading')).toBeNull()
    expect(screen.queryByTestId('calendar-legend')).toBeNull()
    expect(calendarStatsProps.state).toBe('loading')
  })

  it('shows the legend once the month has a scheduled entry', () => {
    monthQueryState.dayMap = new Map([[formatAPIDate(new Date()), [{
      habitId: 'habit-1',
      title: 'Habit',
      status: 'upcoming',
      isBadHabit: false,
      dueTime: '08:00',
      isOneTime: false,
    }]]])
    render(<CalendarPage />)

    expect(screen.getByTestId('calendar-legend')).toBeDefined()
    expect(calendarStatsProps.state).toBe('default')
  })

  it('shows a retryable error card when the calendar query fails', () => {
    monthQueryState.error = 'network down'
    render(<CalendarPage />)

    expect(screen.queryByTestId('month-view')).toBeNull()
    expect(screen.getByText('calendar.loadError')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(monthQueryState.refresh).toHaveBeenCalledTimes(1)
  })

  it('removes recurring habits from the month and shows its honest empty state', () => {
    const todayKey = formatAPIDate(new Date())
    monthQueryState.dayMap = new Map([[todayKey, [{
      habitId: 'recurring',
      title: 'Recurring habit',
      status: 'upcoming',
      isBadHabit: false,
      dueTime: '08:00',
      isOneTime: false,
    }]]])
    render(<CalendarPage />)

    expect(screen.queryByTestId('day-detail')).toBeNull()
    expect(screen.getByTestId('month-stats')).toBeDefined()
    expect(screen.getAllByRole('switch', { name: 'calendar.showRecurring' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('switch', { name: 'calendar.showRecurring' }))

    expect(calendarGridProps.dayMap?.get(todayKey)).toEqual([])
    expect(screen.getByTestId('month-stats').getAttribute('data-state')).toBe('empty')
    expect(screen.getByText('calendar.emptyMonth')).toBeDefined()
  })

  it('removes recurring status rings from the range picker when recurring is turned off', () => {
    const todayKey = formatAPIDate(new Date())
    rangeDayMap = new Map([[todayKey, [{
      habitId: 'recurring',
      title: 'Recurring habit',
      status: 'upcoming',
      isBadHabit: false,
      dueTime: '08:00',
      isOneTime: false,
    }]]])
    render(<CalendarPage />)

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.range' }))
    expect(screen.getByTestId('range-recurring-ring')).toBeDefined()

    fireEvent.click(screen.getByRole('switch', { name: 'calendar.showRecurring' }))

    expect(screen.queryByTestId('range-recurring-ring')).toBeNull()
  })

  it('matches mobile by paging a 61px by 45px drag after the 60px boundary', () => {
    render(<CalendarPage />)
    const initialMonth = calendarDataCalls.mock.calls.at(-1)?.[0] as Date
    const initialCallCount = calendarDataCalls.mock.calls.length
    const drag = (deltaX: number, deltaY = 0) => {
      const target = screen.getByTestId('month-view')
      fireEvent.touchStart(target, { touches: [{ clientX: 100, clientY: 20 }] })
      fireEvent.touchEnd(target, {
        changedTouches: [{ clientX: 100 + deltaX, clientY: 20 + deltaY }],
      })
    }

    drag(-59)
    expect(calendarDataCalls).toHaveBeenCalledTimes(initialCallCount)

    drag(-61, 45)
    expect((calendarDataCalls.mock.calls.at(-1)?.[0] as Date).getMonth())
      .toBe((initialMonth.getMonth() + 1) % 12)

    drag(61)
    expect((calendarDataCalls.mock.calls.at(-1)?.[0] as Date).getMonth())
      .toBe(initialMonth.getMonth())
  })
})
