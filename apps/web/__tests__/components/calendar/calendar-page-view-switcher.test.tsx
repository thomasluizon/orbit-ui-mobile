import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { formatAPIDate } from '@orbit/shared/utils'
import type { CalendarSyncEvent } from '@orbit/shared'

let isWideDesktopValue = false
let isDesktopValue = false
const calendarGridProps: { selectedDateStr?: string | null } = {}
const calendarDayDetailProps: { calendarEvents?: CalendarSyncEvent[] } = {}
const calendarEventsQueryState: {
  data: { status: 'connected'; events: CalendarSyncEvent[] }
} = {
  data: { status: 'connected', events: [] },
}
const monthQueryState: { error: string | null; refresh: ReturnType<typeof vi.fn> } = {
  error: null,
  refresh: vi.fn(),
}
const profileQueryState: {
  profile: { weekStartDay: number } | undefined
  error: Error | null
  refetch: ReturnType<typeof vi.fn>
} = {
  profile: { weekStartDay: 1 },
  error: null,
  refetch: vi.fn(),
}
const calendarDataCalls = vi.fn()
const calendarProfile = {
  weekStartDay: 1,
  hasProAccess: true,
  hasGoogleConnection: true,
  googleCalendarAutoSyncEnabled: true,
  googleCalendarAutoSyncStatus: 'Idle' as const,
  googleCalendarLastSyncedAt: '2026-09-12T09:12:00Z',
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

vi.mock('@/hooks/use-calendar-auto-sync', () => ({
  useSetCalendarAutoSync: () => ({ mutateAsync: vi.fn(async () => {}) }),
}))

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
    dayMap: new Map(),
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

vi.mock('@/hooks/use-calendar-events', () => ({
  useCalendarEvents: () => calendarEventsQueryState,
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (time: string) => time }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => profileQueryState,
}))

vi.mock('@/app/(app)/today-provider', () => ({
  useToday: () => {
    const today = new Date()
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
  CalendarDayDetail: (props: { calendarEvents?: CalendarSyncEvent[] }) => {
    calendarDayDetailProps.calendarEvents = props.calendarEvents
    return <div data-testid="day-detail" />
  },
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
    calendarDayDetailProps.calendarEvents = undefined
    calendarEventsQueryState.data = { status: 'connected', events: [] }
    monthQueryState.error = null
    monthQueryState.refresh = vi.fn()
    profileQueryState.profile = calendarProfile
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

  it("passes only the selected day's Google events to the day detail", () => {
    const selectedDay = formatAPIDate(new Date())
    calendarEventsQueryState.data = {
      status: 'connected',
      events: [
        {
          id: 'selected-event',
          title: 'Team meeting',
          description: null,
          startDate: selectedDay,
          startTime: '09:00',
          endTime: null,
          isRecurring: false,
          recurrenceRule: null,
          reminders: [],
        },
        {
          id: 'other-event',
          title: 'Tomorrow',
          description: null,
          startDate: '2099-01-01',
          startTime: '10:00',
          endTime: null,
          isRecurring: false,
          recurrenceRule: null,
          reminders: [],
        },
      ],
    }
    isWideDesktopValue = true

    render(<CalendarPage />)

    expect(calendarDayDetailProps.calendarEvents?.map((event) => event.id)).toEqual([
      'selected-event',
    ])
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
