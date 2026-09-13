import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { formatAPIDate, formatAPIDateInTimeZone } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

let isWideDesktopValue = false
let isDesktopValue = false
const calendarGridProps: {
  dayMap?: Map<string, CalendarDayEntry[]>
  selectedDateStr?: string | null
  todayKey?: string
} = {}
const monthQueryState: {
  dayMap: Map<string, CalendarDayEntry[]>
  error: string | null
  refresh: ReturnType<typeof vi.fn>
} = {
  dayMap: new Map(),
  error: null,
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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-is-desktop', () => ({
  useIsDesktop: () => isDesktopValue,
  useIsWideDesktop: () => isWideDesktopValue,
}))

vi.mock('@/hooks/use-calendar-data', () => ({
  useCalendarData: (month: Date) => {
    calendarDataCalls(month)
    return ({
    dayMap: monthQueryState.dayMap,
    isLoading: false,
    isFetching: false,
    error: monthQueryState.error,
    refresh: monthQueryState.refresh,
    })
  },
  useCalendarRange: () => ({
    dayMap: new Map(),
    isLoading: false,
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
  CalendarHeader: () => <div data-testid="calendar-header" />,
  CalendarLegend: () => <div data-testid="calendar-legend" />,
  CalendarWeekNav: () => <div data-testid="calendar-week-nav" />,
}))

vi.mock('@/app/(app)/calendar/_components/calendar-shell', () => ({
  CalendarHeader: () => <div data-testid="calendar-header" />,
  CalendarLegend: () => <div data-testid="calendar-legend" />,
  CalendarWeekNav: () => <div data-testid="calendar-week-nav" />,
}))

vi.mock('@/components/calendar/calendar-grid', () => ({
  CalendarGrid: ({
    dayMap,
    onSelectDay,
    selectedDateStr,
    todayKey,
  }: {
    dayMap?: Map<string, CalendarDayEntry[]>
    onSelectDay?: (dateStr: string) => void
    selectedDateStr?: string | null
    todayKey?: string
  }) => {
    calendarGridProps.dayMap = dayMap
    calendarGridProps.selectedDateStr = selectedDateStr
    calendarGridProps.todayKey = todayKey
    return (
      <button
        type="button"
        data-testid="month-view"
        onClick={() => onSelectDay?.('2026-01-05')}
      />
    )
  },
}))

vi.mock('@/components/calendar/calendar-stats', () => ({
  CalendarStats: ({
    stats,
  }: {
    stats: readonly { key: string; value: string | number }[]
  }) => (
    <div data-testid="month-stats">
      {stats.map((stat) => <span key={stat.key}>{`${stat.key}:${stat.value}`}</span>)}
    </div>
  ),
}))

vi.mock('@/components/calendar/calendar-day-detail', () => ({
  CalendarDayDetail: ({
    onShowRecurringChange,
    showRecurring,
  }: {
    onShowRecurringChange: (value: boolean) => void
    showRecurring: boolean
  }) => (
    <div data-testid="day-detail">
      <button
        type="button"
        role="switch"
        aria-checked={showRecurring}
        aria-label="calendar.showRecurring"
        onClick={() => onShowRecurringChange(!showRecurring)}
      />
    </div>
  ),
}))

vi.mock('@/components/calendar/calendar-week-view', () => ({
  CalendarWeekView: () => <div data-testid="week-view" />,
}))

vi.mock('@/components/calendar/calendar-range-view', () => ({
  CalendarRangeView: ({
    monthDayMap,
    onShowRecurringChange,
    showRecurring,
  }: {
    monthDayMap: Map<string, CalendarDayEntry[]>
    onShowRecurringChange: (value: boolean) => void
    showRecurring: boolean
  }) => (
    <div data-testid="range-view">
      {[...monthDayMap.values()].flat().some((entry) => !entry.isOneTime) && (
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
  ),
}))

vi.mock('@/components/calendar/calendar-agenda-view', () => ({
  CalendarAgendaView: () => <div data-testid="agenda-view" />,
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
    isDesktopValue = false
    calendarGridProps.selectedDateStr = undefined
    calendarGridProps.dayMap = undefined
    calendarGridProps.todayKey = undefined
    monthQueryState.dayMap = new Map()
    monthQueryState.error = null
    monthQueryState.refresh = vi.fn()
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC' }
    profileQueryState.error = null
    profileQueryState.refetch = vi.fn()
    calendarDataCalls.mockClear()
  })

  it('loads calendar data concurrently while the profile resolves', () => {
    profileQueryState.profile = undefined
    render(<CalendarPage />)

    expect(calendarDataCalls).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('progressbar', { name: 'common.loading' })).toBeDefined()
    expect(document.querySelector('[data-variant="grid"] > [data-cell="44"]')).toHaveAttribute('data-gap', '0')
  })

  it('shows a retryable error when the profile request fails', () => {
    profileQueryState.profile = undefined
    profileQueryState.error = new Error('profile unavailable')
    render(<CalendarPage />)

    expect(screen.getByText('calendar.loadError')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(profileQueryState.refetch).toHaveBeenCalledTimes(1)
  })

  it('renders one three-option view switcher at phone width and opens the month on today', () => {
    render(<CalendarPage />)

    expect(screen.getAllByRole('radiogroup', { name: 'calendar.view.switchLabel' })).toHaveLength(1)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'calendar.view.month' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('radio', { name: 'calendar.view.agenda' })).toBeNull()
    expect(calendarGridProps.selectedDateStr).toBe(formatAPIDate(new Date()))
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

  it('adds the agenda option at desktop width', () => {
    isDesktopValue = true
    render(<CalendarPage />)

    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getAllByRole('radio', { name: 'calendar.view.agenda' })).toHaveLength(1)
  })

  it('switches from the month heat-map to the agenda planner and back', () => {
    isDesktopValue = true
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

  it('switches to the week and range time-grid views', () => {
    render(<CalendarPage />)

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.week' }))
    expect(screen.getByTestId('week-view')).toBeDefined()

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.range' }))
    expect(screen.getByTestId('range-view')).toBeDefined()
  })

  it('renders the day detail as a persistent inline panel at wide desktop', () => {
    isWideDesktopValue = true
    render(<CalendarPage />)

    expect(screen.getByTestId('calendar-day-panel')).toBeDefined()
    expect(screen.getByTestId('day-detail')).toBeDefined()
  })

  it('opens the day detail as an overlay below the wide-desktop breakpoint', () => {
    render(<CalendarPage />)

    expect(screen.queryByTestId('calendar-day-panel')).toBeNull()
    expect(screen.queryByTestId('day-detail')).toBeNull()

    fireEvent.click(screen.getByTestId('month-view'))
    expect(screen.getByTestId('day-detail')).toBeDefined()
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
    expect(screen.queryByTestId('month-stats')).toBeNull()
    expect(screen.getByText('calendar.emptyMonth')).toBeDefined()
  })

  it('removes recurring status rings from the range picker when recurring is turned off', () => {
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
