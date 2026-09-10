import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { formatAPIDate } from '@orbit/shared/utils'

let isWideDesktopValue = false
const calendarGridProps: { selectedDateStr?: string | null } = {}
const monthQueryState: { error: string | null; refresh: ReturnType<typeof vi.fn> } = {
  error: null,
  refresh: vi.fn(),
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-is-desktop', () => ({
  useIsDesktop: () => false,
  useIsWideDesktop: () => isWideDesktopValue,
}))

vi.mock('@/hooks/use-calendar-data', () => ({
  useCalendarData: () => ({
    dayMap: new Map(),
    isLoading: false,
    isFetching: false,
    error: monthQueryState.error,
    refresh: monthQueryState.refresh,
  }),
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
  useProfile: () => ({ profile: { weekStartDay: 1 } }),
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
    onSelectDay,
    selectedDateStr,
  }: {
    onSelectDay?: (dateStr: string) => void
    selectedDateStr?: string | null
  }) => {
    calendarGridProps.selectedDateStr = selectedDateStr
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
  CalendarStats: () => <div data-testid="month-stats" />,
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
    calendarGridProps.selectedDateStr = undefined
    monthQueryState.error = null
    monthQueryState.refresh = vi.fn()
  })

  it('renders one four-option view switcher at phone width and opens the month on today', () => {
    render(<CalendarPage />)

    expect(screen.getAllByRole('radiogroup', { name: 'calendar.view.switchLabel' })).toHaveLength(1)
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getByRole('radio', { name: 'calendar.view.month' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'calendar.view.agenda' })).toBeDefined()
    expect(calendarGridProps.selectedDateStr).toBe(formatAPIDate(new Date()))
  })

  it('switches from the month heat-map to the agenda planner and back', () => {
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
})
