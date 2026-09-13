import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import {
  buildCalendarMonthModel,
  CALENDAR_MONTH_GRID_RESERVED_DAY_HEIGHT,
  formatAPIDate,
} from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'

let isWideDesktopValue = false
let isDesktopValue = false
const calendarGridProps: Record<string, unknown> = {}
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
    isLoading: monthQueryState.isLoading,
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
    if (timeZone === 'Pacific/Kiritimati') return today.toISOString().slice(0, 10)
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
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
            onClick={() => props.onSelectDay?.('2026-01-05')}
          />
        </>
      )
    },
  }
})

vi.mock('@/components/calendar/calendar-stats', () => ({
  CalendarStats: (props: Record<string, unknown>) => {
    Object.assign(calendarStatsProps, props)
    return <div data-testid="month-stats" data-state={String(props.state)} />
  },
}))

vi.mock('@/components/calendar/calendar-day-detail', () => ({
  CalendarDayDetail: () => <div data-testid="day-detail" />,
}))

vi.mock('@/components/calendar/calendar-week-view', () => ({
  CalendarWeekView: () => <div data-testid="week-view" />,
}))

vi.mock('@/components/calendar/calendar-range-view', () => ({
  CalendarRangeView: () => <div data-testid="range-view" />,
}))

vi.mock('@/components/calendar/calendar-agenda-view', () => ({
  CalendarAgendaView: () => <div data-testid="agenda-view" />,
}))

import CalendarPage from '@/app/(app)/calendar/page'

describe('CalendarPage view switcher', () => {
  beforeEach(() => {
    isWideDesktopValue = false
    isDesktopValue = false
    calendarGridProps.selectedDateStr = undefined
    calendarStatsProps.state = undefined
    monthQueryState.dayMap = new Map()
    calendarGridProps.todayKey = undefined
    monthQueryState.error = null
    monthQueryState.isLoading = false
    monthQueryState.refresh = vi.fn()
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC' }
    profileQueryState.error = null
    profileQueryState.refetch = vi.fn()
    calendarDataCalls.mockClear()
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
    const loadedRows = buildCalendarMonthModel(loadedMonth, new Map(), weekStartDay).gridDays.length / 7
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
})
