import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import { expectSmallSheetActions } from '@/__tests__/support/sheet-slots'
import type { CalendarImportActionState } from '@/components/calendar-sync/calendar-import-content'
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [] }) }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => <button aria-label="Avisos" /> }))
vi.mock('@/components/shell/destination-shell', () => ({ useShellHeaderSlot: () => false }))
const toastError = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
import { advanceAccountGeneration } from '@/lib/session-epoch'
import {
  buildCalendarMonthModel,
  formatAPIDate,
  formatAPIDateInTimeZone,
} from '@orbit/shared/utils'
import type { CalendarSyncEvent } from '@orbit/shared'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => { vi.useRealTimers(); Reflect.deleteProperty(navigator, 'onLine') })

const MOCK_ACCOUNT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

function getMockAccountDateKey(): string {
  return formatAPIDateInTimeZone(new Date(), MOCK_ACCOUNT_TIME_ZONE)
}

let calendarLocale = 'en'
let isWideDesktopValue = false
let calendarRouteSearch = ''
let calendarGridSelectionDate = '2026-01-05'
const calendarGridProps: Record<string, unknown> & {
  currentMonth?: Date
  dayMap?: Map<string, CalendarDayEntry[]>
  selectedDateStr?: string | null
  todayKey?: string
} = {}
const calendarStatsProps: Record<string, unknown> = {}
let autoSyncState: CalendarAutoSyncState = {
  enabled: true,
  status: 'Idle',
  lastSyncedAt: '2026-09-12T09:12:00Z',
  hasGoogleConnection: true,
}
let autoSyncQueryOptions: {
  enabled?: boolean
  initialData?: CalendarAutoSyncState
} | undefined
const setAutoSync = vi.fn(async ({ enabled }: { enabled: boolean }) => {
  autoSyncState = { ...autoSyncState, enabled }
})
const monthQueryState: {
  dayMap: Map<string, CalendarDayEntry[]>
  error: string | null
  isLoading: boolean
  isFetching: boolean
  refresh: ReturnType<typeof vi.fn>
} = {
  dayMap: new Map(),
  error: null,
  isLoading: false,
  isFetching: false,
  refresh: vi.fn(),
}
const profileQueryState: {
  profile: {
    weekStartDay: number
    timeZone: string | null
    hasProAccess: boolean
    hasGoogleConnection?: boolean
    googleCalendarAutoSyncEnabled?: boolean
    googleCalendarAutoSyncStatus?: 'Idle' | 'ReconnectRequired' | 'TransientError'
    googleCalendarLastSyncedAt?: string | null
  } | undefined
  error: Error | null
  refetch: ReturnType<typeof vi.fn>
} = {
  profile: { weekStartDay: 1, timeZone: MOCK_ACCOUNT_TIME_ZONE, hasProAccess: false },
  error: null,
  refetch: vi.fn(),
}
const calendarDataCalls = vi.fn()
const logHabitMutateAsync = vi.fn(async () => {})
const routerPush = vi.fn()
const routerReplace = vi.fn()
const calendarDayDetailProps: {
  dateStr?: string | null
  calendarEvents?: CalendarSyncEvent[]
  autoSyncState?: CalendarAutoSyncState
  calendarEventsState?: string
  onRetryCalendarEvents?: () => void
  onReconnectCalendarEvents?: () => void
  onOpenEvents?: () => void
  onOpenHabitTitle?: (title: string) => void
  onViewPro?: () => void
  loggable?: boolean
  onEntryChange?: (entry: CalendarDayEntry, checked: boolean) => Promise<void>
  onCalendarAutoSyncChange?: (enabled: boolean) => Promise<void>
  onShowRecurringChange?: (value: boolean) => void
  showRecurring?: boolean
} = {}
const calendarEventsQueryState: {
  data: { status: 'connected'; events: CalendarSyncEvent[] } | { status: 'not-connected' }
  isPending: boolean
  error: Error | null
  refetch: ReturnType<typeof vi.fn>
} = {
  data: { status: 'connected', events: [] },
  isPending: false,
  error: null,
  refetch: vi.fn(),
}
let calendarEventsEnabled: boolean | undefined
let calendarEventsTimeZone: string | null | undefined
const agendaViewProps: {
  dayMap?: ReadonlyMap<string, CalendarDayEntry[]>
  isLoading?: boolean
} = {}
let rangeLoading = false
let rangeFetching = false
let rangeDayMap = new Map<string, CalendarDayEntry[]>()
const calendarRangeViewProps: { current: Record<string, unknown> | null } = { current: null }

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: toastError, showSuccess: toastSuccess }) }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { start: string; end: string }) => key === 'calendar.range.label'
    ? (calendarLocale === 'pt-BR' ? ptBR : en).calendar.range.label.replace('{start}', values!.start).replace('{end}', values!.end)
    : key,
  useLocale: () => calendarLocale,
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
    isFetching: monthQueryState.isFetching,
    error: monthQueryState.error,
    refresh: monthQueryState.refresh,
    })
  },
  useCalendarRange: () => ({
    dayMap: rangeDayMap,
    isLoading: rangeLoading,
    isFetching: rangeFetching,
    error: null,
    refresh: vi.fn(),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(calendarRouteSearch),
}))

vi.mock('@/components/calendar-sync/calendar-import-content', () => ({
  CalendarImportContent: ({ reviewMode, onActionStateChange }: { reviewMode: boolean; onActionStateChange: (state: CalendarImportActionState) => void }) => <div data-testid="calendar-import-content" data-review={String(reviewMode)}><button type="button" onClick={() => onActionStateChange({ count: 1, disabled: false })}>select-event</button></div>,
}))

vi.mock('@/hooks/use-calendar-events', () => ({
  useCalendarEvents: (options?: { enabled?: boolean; timeZone?: string | null }) => {
    calendarEventsEnabled = options?.enabled
    calendarEventsTimeZone = options?.timeZone
    return calendarEventsQueryState
  },
}))

vi.mock('@/hooks/use-calendar-auto-sync', () => ({
  useCalendarAutoSyncState: (options?: {
    enabled?: boolean
    initialData?: CalendarAutoSyncState
  }) => {
    autoSyncQueryOptions = options
    return { data: autoSyncState }
  },
  useSetCalendarAutoSync: () => ({ mutateAsync: setAutoSync }),
  useRunCalendarSyncNow: () => ({ mutateAsync: vi.fn(async () => {}) }),
}))

vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutateAsync: logHabitMutateAsync }),
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

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/app/(app)/calendar/_components/calendar-shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/(app)/calendar/_components/calendar-shell')>()
  return {
    ...actual,
    CalendarHeader: (props: React.ComponentProps<typeof actual.CalendarHeader>) => <actual.CalendarHeader {...props}
      viewSelector={<>{!props.period ? <button type="button" data-testid="calendar-header" onClick={props.onNextMonth} /> : null}{props.viewSelector}</>} />,
    CalendarLegend: () => <div data-testid="calendar-legend" />,
  }
})

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
  CalendarDayDetail: (props: typeof calendarDayDetailProps) => {
    Object.assign(calendarDayDetailProps, props)
    const displayedAutoSyncState = props.autoSyncState
    return (
      <div data-testid="day-detail">
        <button onClick={props.onOpenEvents}>open-events</button>
        <button onClick={() => props.onOpenHabitTitle?.('Long habit title')}>open-habit-title</button>
        {displayedAutoSyncState?.hasGoogleConnection ? (
          <button
            type="button"
            role="switch"
            aria-checked={displayedAutoSyncState.enabled}
            aria-label="calendar.dayDetail.autoSync"
            onClick={() => void props.onCalendarAutoSyncChange?.(!displayedAutoSyncState.enabled)}
          />
        ) : null}
      </div>
    )
  },
}))

vi.mock('@/components/calendar/calendar-week-view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/calendar/calendar-week-view')>()
  return {
    CalendarWeekView: (props: React.ComponentProps<typeof actual.CalendarWeekView>) => <>
      <actual.CalendarWeekView {...props} />
      <button type="button" data-testid="week-view" />
      <button type="button" data-testid="week-day" onClick={() => props.onSelectDay('2026-09-12')} />
      <button type="button" data-testid="visible-week-day" onClick={() => props.onSelectDay(props.columns[3]!.dateStr)} />
    </>,
  }
})

vi.mock('@/components/calendar/calendar-range-view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/calendar/calendar-range-view')>()
  return {
    ...actual,
    CalendarRangeView: (props: React.ComponentProps<typeof actual.CalendarRangeView>) => {
      calendarRangeViewProps.current = props
      return (
        <div data-testid="range-view">
          <actual.CalendarRangeView {...props} />
        </div>
      )
    },
  }
})

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
import { useUIStore } from '@/stores/ui-store'
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'

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
  it.each(['month', 'week', 'range', 'agenda'])('keeps the %s radio and frame mounted when the profile resolves', (selectedView) => {
    profileQueryState.profile = undefined
    const page = render(<CalendarPage />)
    const heading = screen.getByRole('heading', { name: 'nav.calendar' })
    const options = screen.getByRole('button', { name: 'calendar.options' })
    const header = screen.getByTestId('calendar-header-group')
    const radio = screen.getByRole('radio', { name: `calendar.view.${selectedView}` })
    fireEvent.click(radio)
    radio.focus()
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: false }
    page.rerender(<CalendarPage />)
    expect(radio.isConnected).toBe(true)
    expect(radio).toHaveFocus()
    expect(screen.getByTestId('calendar-header-group')).toBe(header)
    expect(screen.getByRole('heading', { name: 'nav.calendar' })).toBe(heading)
    expect(screen.getByRole('button', { name: 'calendar.options' })).toBe(options)
  })

  it('keeps the month picker open when the profile resolves', () => {
    profileQueryState.profile = undefined
    const page = render(<CalendarPage />)
    const picker = screen.getByRole('button', { name: /calendar.monthPicker/ })
    fireEvent.click(picker)
    expect(picker).toHaveAttribute('aria-expanded', 'true')
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: false }
    page.rerender(<CalendarPage />)
    expect(picker.isConnected).toBe(true)
    expect(picker).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'close-overlay' })).toBeInTheDocument()
  })

  it('returns Semana to profile today across a device week boundary', () => {
    const previousZone = process.env.TZ
    process.env.TZ = 'UTC'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T00:30:00Z'))
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'America/Sao_Paulo', hasProAccess: true }
    try {
      render(<CalendarPage />)
      fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.week' }))
      const current = () => screen.getByRole('button', { name: /^calendar.period.goToCurrent/ })
      expect.soft(current()).toHaveTextContent('Sep 28 to Oct 4')
      fireEvent.click(screen.getByRole('button', { name: 'common.nextWeek' }))
      expect.soft(current()).toHaveTextContent('Oct 5 to Oct 11')
      fireEvent.click(current())
      expect(current()).toHaveTextContent('Sep 28 to Oct 4')
    } finally {
      if (previousZone === undefined) Reflect.deleteProperty(process.env, 'TZ')
      else process.env.TZ = previousZone
      vi.useRealTimers()
    }
  })

  it.each([false, true])('keeps the UTC account-day fallback for a null profile time zone, delayed: %s', (delayed) => {
    const previousZone = process.env.TZ
    process.env.TZ = 'America/Sao_Paulo'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T00:30:00Z'))
    const profile = { weekStartDay: 1 as const, timeZone: null, hasProAccess: false }
    profileQueryState.profile = delayed ? undefined : profile
    try {
      const page = render(<CalendarPage />)
      fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.week' }))
      profileQueryState.profile = profile
      page.rerender(<CalendarPage />)
      expect(screen.getByRole('button', { name: /^calendar.period.goToCurrent/ })).toHaveTextContent('Oct 5 to Oct 11')
    } finally {
      if (previousZone === undefined) Reflect.deleteProperty(process.env, 'TZ')
      else process.env.TZ = previousZone
      vi.useRealTimers()
    }
  })

  it.each([false, true])('uses profile today after loading while preserving explicit week navigation: %s', (navigated) => {
    const previousZone = process.env.TZ
    process.env.TZ = 'UTC'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T00:30:00Z'))
    profileQueryState.profile = undefined
    try {
      const page = render(<CalendarPage />)
      fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.week' }))
      const current = () => screen.getByRole('button', { name: /^calendar.period.goToCurrent/ })
      if (navigated) fireEvent.click(screen.getByRole('button', { name: 'common.nextWeek' }))
      profileQueryState.profile = { weekStartDay: 1, timeZone: 'America/Sao_Paulo', hasProAccess: true }
      page.rerender(<CalendarPage />)
      expect(current()).toHaveTextContent(navigated ? 'Oct 12 to Oct 18' : 'Sep 28 to Oct 4')
    } finally {
      if (previousZone === undefined) Reflect.deleteProperty(process.env, 'TZ')
      else process.env.TZ = previousZone
      vi.useRealTimers()
    }
  })

  it('puts every week pager control in the header before the selector and preserves the view while paging', () => {
    render(<CalendarPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.week' }))
    const header = screen.getByTestId('calendar-header-group')
    const selector = screen.getByRole('radiogroup')
    const pager = [screen.getByRole('button', { name: 'common.previousWeek' }), screen.getByRole('button', { name: 'common.nextWeek' }), screen.getByRole('button', { name: /^calendar.period.goToCurrent/ })]
    for (const control of pager) {
      expect(header).toContainElement(control)
      expect(control.compareDocumentPosition(selector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    const label = pager[2]!.textContent
    fireEvent.click(pager[1]!)
    expect(screen.getByRole('button', { name: /^calendar.period.goToCurrent/ }).textContent).not.toBe(label)
    fireEvent.click(pager[0]!)
    expect(screen.getByRole('button', { name: /^calendar.period.goToCurrent/ }).textContent).toBe(label)
    expect(screen.getByRole('radio', { name: 'calendar.view.week' })).toHaveAttribute('aria-checked', 'true')
  })
  it.each([
    ['en', 1, ['M', 'T', 'W', 'T', 'F', 'S', 'S']],
    ['en', 0, ['S', 'M', 'T', 'W', 'T', 'F', 'S']],
    ['pt-BR', 1, ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']],
    ['pt-BR', 0, ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']],
  ] as const)('renders drawn month and range weekday letters in %s starting on %i', (locale, weekStartDay, labels) => {
    calendarLocale = locale
    profileQueryState.profile = { weekStartDay, timeZone: MOCK_ACCOUNT_TIME_ZONE, hasProAccess: true }
    render(<CalendarPage />)
    expect(Array.from(screen.getByTestId('month-grid-header').children, (child) => child.textContent)).toEqual(labels)
    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.range' }))
    expect(Array.from(screen.getByTestId('month-grid-header').children, (child) => child.textContent)).toEqual(labels)
  })

  beforeEach(() => {
    useUIStore.setState({ calendarShowRecurring: true });
    calendarLocale = 'en'
    isWideDesktopValue = false
    calendarRouteSearch = ''
    calendarGridSelectionDate = '2026-01-05'
    calendarGridProps.selectedDateStr = undefined
    calendarDayDetailProps.calendarEvents = undefined
    calendarDayDetailProps.autoSyncState = undefined
    autoSyncState = {
      enabled: true,
      status: 'Idle',
      lastSyncedAt: '2026-09-12T09:12:00Z',
      hasGoogleConnection: true,
    }
    autoSyncQueryOptions = undefined
    setAutoSync.mockClear()
    toastError.mockClear()
    toastSuccess.mockClear()
    calendarGridProps.dayMap = undefined
    calendarGridProps.todayKey = undefined
    calendarStatsProps.state = undefined
    monthQueryState.dayMap = new Map()
    monthQueryState.error = null
    monthQueryState.isLoading = false
    monthQueryState.isFetching = false
    monthQueryState.refresh = vi.fn()
    profileQueryState.profile = {
      weekStartDay: 1,
      timeZone: MOCK_ACCOUNT_TIME_ZONE,
      hasProAccess: false,
    }
    profileQueryState.error = null
    profileQueryState.refetch = vi.fn()
    calendarDataCalls.mockClear()
    logHabitMutateAsync.mockClear()
    routerPush.mockClear()
    routerReplace.mockClear()
    calendarEventsQueryState.data = { status: 'connected', events: [] }
    calendarEventsQueryState.isPending = false
    calendarEventsQueryState.error = null
    calendarEventsQueryState.refetch = vi.fn()
    calendarEventsEnabled = undefined
    calendarEventsTimeZone = undefined
    delete calendarDayDetailProps.calendarEvents
    delete calendarDayDetailProps.calendarEventsState
    delete calendarDayDetailProps.onRetryCalendarEvents
    delete calendarDayDetailProps.onReconnectCalendarEvents
    delete calendarDayDetailProps.onViewPro
    delete calendarDayDetailProps.loggable
    delete calendarDayDetailProps.onEntryChange
    delete calendarDayDetailProps.onCalendarAutoSyncChange
    agendaViewProps.dayMap = undefined
    agendaViewProps.isLoading = undefined
    rangeLoading = false
    rangeFetching = false
    rangeDayMap = new Map()
    calendarRangeViewProps.current = null
  })

  afterEach(() => vi.useRealTimers())

  it.each(['month', 'range'] as const)('keeps the %s first-load skeleton and shows no indicator during a refetch', (view) => {
    monthQueryState.isLoading = view === 'month'
    monthQueryState.isFetching = view === 'month'
    rangeLoading = view === 'range'
    rangeFetching = view === 'range'
    const { rerender } = render(<CalendarPage />)
    if (view === 'range') fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.range' }))

    expect(screen.getAllByRole('progressbar', { name: view === 'month' ? 'calendar.loading' : 'common.loading' }).length).toBeGreaterThan(0)
    expect(document.querySelector('[data-variant="grid"]')).not.toBeNull()
    if (view === 'month') expect(document.querySelector('[data-variant="settings"]')).not.toBeNull()

    monthQueryState.isLoading = false
    monthQueryState.isFetching = false
    rangeLoading = false
    rangeFetching = false
    monthQueryState.dayMap = new Map([[getMockAccountDateKey(), [monthEntry('loaded', 'completed')]]])
    rangeDayMap = monthQueryState.dayMap
    rerender(<CalendarPage />)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByTestId(view === 'month' ? 'day-detail' : 'range-view')).toBeInTheDocument()

    monthQueryState.isFetching = view === 'month'
    rangeFetching = view === 'range'
    rerender(<CalendarPage />)
    expect(screen.getByTestId('calendar-header-group').nextElementSibling).toContainElement(
      screen.getByTestId(view === 'month' ? 'day-detail' : 'range-view'),
    )
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByTestId(view === 'month' ? 'day-detail' : 'range-view')).toBeInTheDocument()
    expect(screen.getByTestId('month-stats')).not.toHaveAttribute('data-state', 'loading')
  })

  it('loads calendar data concurrently while the profile resolves', () => {
    profileQueryState.profile = undefined
    render(<CalendarPage />)

    expect(calendarDataCalls).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('progressbar', { name: 'calendar.loading' })).toHaveLength(2)
    expect(screen.getByTestId('calendar-grid-card').querySelector('[role="progressbar"]')).toHaveAttribute('data-cols', '7')
  })

  it('does not enable the calendar event request for a free profile', () => {
    calendarEventsQueryState.data = {
      status: 'connected',
      events: [
        {
          id: 'retained-event',
          title: 'Retained meeting',
          description: null,
          startDate: getMockAccountDateKey(),
          startTime: '09:00',
          endTime: null,
          isRecurring: false,
          recurrenceRule: null,
          reminders: [],
        },
      ],
    }
    isWideDesktopValue = true

    render(<CalendarPage />)

    expect(calendarEventsEnabled).toBe(false)
    expect(calendarDayDetailProps.calendarEvents).toEqual([])
    expect(calendarDayDetailProps.calendarEventsState).toBe('pro-boundary')
    calendarDayDetailProps.onViewPro?.()
    expect(routerPush).toHaveBeenCalledWith('/upgrade')
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
    const loadingRows = Number(screen.getByTestId('calendar-grid-card').querySelector('[role="progressbar"]')?.getAttribute('data-rows'))

    profileQueryState.profile = { weekStartDay, timeZone: 'UTC', hasProAccess: false }
    rerender(<CalendarPage />)
    const loadedMonth = calendarGridProps.currentMonth as Date
    const loadedRows = buildCalendarMonthModel(
      loadedMonth,
      new Map(),
      weekStartDay,
      formatAPIDate(now),
    ).gridDays.length / 7
    const loadedHeight = screen.getByTestId('month-grid-days').style.minHeight

    expect(loadedRows).toBe(expectedRows)
    const expectedLoadingRows = buildCalendarMonthModel(loadedMonth, new Map(), 1, formatAPIDate(now)).gridDays.length / 7
    expect(loadingRows).toBe(expectedLoadingRows)
    expect(loadedHeight).toBe('')
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
    profileQueryState.profile = {
      weekStartDay: 1,
      timeZone: 'Pacific/Kiritimati',
      hasProAccess: false,
    }
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
      initialTimeZone: 'UTC',
      deviceTimeZone: 'Pacific/Kiritimati',
      accountTimeZone: 'America/Los_Angeles',
      now: '2026-09-12T10:30:00.000Z',
      firstDay: '2026-09-12',
      secondDay: '2026-09-13',
      expected: ['bestStreak:1', 'totalLogs:1', 'missed:0'],
    },
    {
      name: 'device date is one day behind',
      initialTimeZone: undefined,
      deviceTimeZone: 'America/Los_Angeles',
      accountTimeZone: 'UTC',
      now: '2026-09-12T00:30:00.000Z',
      firstDay: '2026-09-11',
      secondDay: '2026-09-12',
      expected: ['bestStreak:2', 'totalLogs:2', 'missed:1'],
    },
  ])('renders statistics through the account date when $name', ({
    initialTimeZone,
    deviceTimeZone,
    accountTimeZone,
    now,
    firstDay,
    secondDay,
    expected,
  }) => {
    const workerTimeZone = process.env.TZ
    const workerResolvedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (initialTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = initialTimeZone
    try {
      const originalTimeZone = process.env.TZ
      process.env.TZ = deviceTimeZone
      vi.useFakeTimers()
      vi.setSystemTime(new Date(now))
      profileQueryState.profile = {
        weekStartDay: 1,
        timeZone: accountTimeZone,
        hasProAccess: false,
      }
      setBoundaryEntries(firstDay, secondDay)
      try {
        render(<CalendarPage />)

        for (const figure of expected) expect(screen.getByText(figure)).toBeDefined()
      } finally {
        vi.useRealTimers()
        if (originalTimeZone === undefined) delete process.env.TZ
        else process.env.TZ = originalTimeZone
      }

      expect(Object.hasOwn(process.env, 'TZ')).toBe(initialTimeZone !== undefined)
      expect(process.env.TZ).toBe(initialTimeZone)
    } finally {
      if (workerTimeZone === undefined) {
        process.env.TZ = workerResolvedTimeZone
        delete process.env.TZ
      } else process.env.TZ = workerTimeZone
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

  it('keeps recurring entries hidden when switching to agenda', () => {
    const today = getMockAccountDateKey()
    rangeDayMap = new Map([
      [today, [
        monthEntry('recurring', 'upcoming'),
        { ...monthEntry('one-time', 'upcoming'), isOneTime: true },
      ]],
    ])
    render(<CalendarPage />)

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.week' }))
    fireEvent.click(screen.getByRole('button', { name: 'calendar.options' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'calendar.showRecurring' }))
    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.agenda' }))

    expect(agendaViewProps.dayMap?.get(today)?.map((entry) => entry.habitId)).toEqual([
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

  it('keeps the selector in the header and the selected day below the grid at wide width', () => {
    isWideDesktopValue = true
    render(<CalendarPage />)
    expect(screen.queryByRole('button', { name: 'Avisos' })).not.toBeInTheDocument()
    expect(screen.getByTestId('calendar-shell-header')).toContainElement(screen.getByRole('button', { name: 'calendar.options' }))

    const header = screen.getByTestId('calendar-header-group')
    const selector = screen.getByRole('radiogroup', { name: 'calendar.view.switchLabel' })
    const grid = screen.getByTestId('calendar-grid')
    const detail = screen.getByTestId('day-detail')
    expect(header).toContainElement(selector)
    expect(grid.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('preserves the options menu and selected view when moving the bell out of the header and back', () => {
    const { rerender } = render(<CalendarPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.week' }))
    expect(screen.getAllByRole('button', { name: 'Avisos' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'calendar.options' }))

    isWideDesktopValue = true
    rerender(<CalendarPage />)
    expect(screen.queryByRole('button', { name: 'Avisos' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'calendar.options' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'calendar.showRecurring' }))
    expect(useUIStore.getState().calendarShowRecurring).toBe(false)
    expect(screen.getByRole('radio', { name: 'calendar.view.week' })).toHaveAttribute('aria-checked', 'true')

    isWideDesktopValue = false
    rerender(<CalendarPage />)
    expect(screen.getAllByRole('button', { name: 'Avisos' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'calendar.options' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('radio', { name: 'calendar.view.week' })).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps the grid and day detail inside a 412px wide shell column', () => {
    isWideDesktopValue = true
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    const { container } = render(<div style={{ width: 412 }}><CalendarPage /></div>)
    const gridTrack = screen.getByTestId('calendar-grid-card') as HTMLElement
    expect(gridTrack).toHaveClass('orbit-calendar-grid-card')
    fireEvent.click(screen.getByTestId('month-view'))
    expect(container.querySelector('[data-testid="day-detail"]')).not.toBeNull()
    expect(calendarDayDetailProps.dateStr).toBe(calendarGridSelectionDate)
  })

  it.each([false, true])('keeps the loading column independent of wide desktop: %s', (wide) => {
    isWideDesktopValue = wide
    monthQueryState.isLoading = true
    const page = render(<CalendarPage />)
    expect(screen.getByTestId('calendar-header-group')).toContainElement(
      screen.getByRole('radiogroup', { name: 'calendar.view.switchLabel' }),
    )
    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument()
    expect(screen.getByTestId('calendar-day-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('day-detail')).toBeNull()
    expect(screen.getByTestId('month-stats')).toHaveAttribute('data-state', 'loading')
    monthQueryState.isLoading = false
    page.rerender(<CalendarPage />)
    expect(screen.queryByTestId('calendar-day-skeleton')).toBeNull()
    expect(screen.getByTestId('day-detail')).toBeInTheDocument()
    expect(screen.getByTestId('month-stats')).not.toHaveAttribute('data-state', 'loading')
  })

  it('keeps the day sheet for a selected week day', () => {
    render(<CalendarPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.week' }))
    fireEvent.click(screen.getByTestId('week-day'))
    expect(screen.getByRole('button', { name: 'close-overlay' })).toBeInTheDocument()
    expect(calendarDayDetailProps.dateStr).toBe('2026-09-12')
  })

  it.each(['events', 'habit'])('closes the week day sheet before opening %s disclosure', (disclosure) => {
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: true }
    render(<CalendarPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.week' }))
    fireEvent.click(screen.getByTestId('week-day'))
    sheetTestControls.defer(true)
    try {
      fireEvent.click(screen.getByRole('button', { name: disclosure === 'events' ? 'open-events' : 'open-habit-title' }))
      expect(sheetTestControls.isDismissPending).toBe(true)
      expect(screen.queryByRole('dialog')).toBeNull()
      act(() => sheetTestControls.completeDismissal())
      expect(screen.getByRole('dialog')).toHaveAccessibleName(disclosure === 'events' ? 'calendar.dayDetail.eventsTitle' : 'habits.form.title')
      expect(screen.queryByTestId('day-detail')).toBeNull()
      expect(screen.getByRole('radio', { name: 'calendar.view.week' })).toHaveAttribute('aria-checked', 'true')
      fireEvent.click(screen.getByRole('button', { name: 'close-overlay' }))
      act(() => sheetTestControls.completeDismissal())
      fireEvent.click(screen.getByTestId('week-day'))
      expect(calendarDayDetailProps.dateStr).toBe('2026-09-12')
    } finally { sheetTestControls.defer(false) }
  })

  it('returns from a later week to the month containing the selected day', () => {
    render(<CalendarPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.week' }))
    for (let week = 0; week < 4; week += 1) fireEvent.click(screen.getByRole('button', { name: 'common.nextWeek' }))
    fireEvent.click(screen.getByTestId('visible-week-day'))
    expect(calendarDayDetailProps.dateStr).toBe('2026-10-08')

    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.month' }))
    expect(calendarGridProps.currentMonth).toEqual(new Date(2026, 9, 1))
    expect(calendarGridProps.selectedDateStr).toBe('2026-10-08')
    expect(calendarDayDetailProps.dateStr).toBe('2026-10-08')
  })

  it.each(['month', 'week', 'range', 'agenda'] as const)('keeps a working first navigation line in %s', (view) => {
    render(<CalendarPage />)
    if (view !== 'month') fireEvent.click(screen.getByRole('radio', { name: `calendar.view.${view}` }))
    const header = screen.getByTestId('calendar-header-group')
    const pager = header.querySelector('[data-testid$="-navigation"]')
    expect(pager).not.toBeNull()
    const previousLabel = view === 'month' ? 'common.previousMonth' : view === 'range' ? 'calendar.range.previous' : 'common.previousWeek'
    expect(header.querySelector(`button[aria-label="${previousLabel}"]`)).not.toBeNull()
    expect(header.querySelector('[role="radiogroup"]')).not.toBeNull()
  })

  it('shows only the range navigation in range view', () => {
    render(<CalendarPage />)
    fireEvent.click(screen.getByRole('radio', { name: 'calendar.view.range' }))
    expect(screen.queryByTestId('calendar-header')).toBeNull()
    expect(screen.getByTestId('range-view')).toBeInTheDocument()
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
    const todayKey = getMockAccountDateKey()
    const futureDay = '2026-02-05'
    calendarGridSelectionDate = futureDay
    monthQueryState.dayMap = new Map([
      [todayKey, [monthEntry('current-recurring', 'upcoming')]],
      [futureDay, [monthEntry('future-recurring', 'upcoming')]],
    ])
    render(<CalendarPage />)

    expect(screen.getByTestId('day-detail')).toBeDefined()
    expect(screen.queryByRole('switch', { name: 'calendar.showRecurring' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'calendar.options' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'calendar.showRecurring' }))
    fireEvent.click(screen.getByTestId('calendar-header'))
    fireEvent.click(screen.getByTestId('month-view'))

    expect(calendarGridProps.currentMonth).toEqual(new Date(2026, 1, 1))
    expect(calendarGridProps.selectedDateStr).toBe(futureDay)
    expect(screen.queryByRole('switch', { name: 'calendar.showRecurring' })).not.toBeInTheDocument()
  })

  it('logs a selected writable day with its selected date', async () => {
    isWideDesktopValue = true
    const entry: CalendarDayEntry = {
      habitId: 'habit-1',
      title: 'Read',
      status: 'upcoming',
      isBadHabit: false,
      dueTime: null,
      isOneTime: false,
    }
    const selectedDate = getMockAccountDateKey()
    monthQueryState.dayMap = new Map([[selectedDate, [entry]]])
    render(<CalendarPage />)

    await calendarDayDetailProps.onEntryChange?.(entry, true)

    expect(calendarDayDetailProps.loggable).toBe(true)
    expect(logHabitMutateAsync).toHaveBeenCalledWith({
      habitId: 'habit-1',
      date: selectedDate,
      intent: 'log',
    })
  })

  it("passes only the selected day's Google events to the day detail", () => {
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: true }
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
    expect(calendarEventsTimeZone).toBe('UTC')
  })

  it('passes a failed Google events query to the selected-day panel', () => {
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: true }
    calendarEventsQueryState.error = new Error('calendar events unavailable')
    isWideDesktopValue = true

    render(<CalendarPage />)

    expect(calendarDayDetailProps.calendarEventsState).toBe('failed')
    calendarDayDetailProps.onRetryCalendarEvents?.()
    expect(calendarEventsQueryState.refetch).toHaveBeenCalledTimes(1)
  })

  it('passes a revoked Google authorization to the selected-day panel', () => {
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: true }
    calendarEventsQueryState.data = { status: 'not-connected' }
    isWideDesktopValue = true

    render(<CalendarPage />)

    expect(calendarDayDetailProps.calendarEventsState).toBe('not-connected')
    expect(calendarDayDetailProps.calendarEvents).toEqual([])
    act(() => { calendarDayDetailProps.onReconnectCalendarEvents?.() })
    expect(screen.getByRole('button', { name: 'close-overlay' })).toBeInTheDocument()
    expect(routerPush).not.toHaveBeenCalledWith('/calendar-sync')
  })

  it('opens the review sheet from a review notification route', () => {
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: true }
    calendarRouteSearch = 'mode=review'
    render(<CalendarPage />)
    expect(screen.getByTestId('calendar-import-content')).toHaveAttribute('data-review', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'select-event' }))
    expectSmallSheetActions()
  })

  it('opens review targets after the initial account binding', () => {
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: true }
    const view = render(<CalendarPage />)
    act(() => holdAccount('review-target-account'))
    calendarRouteSearch = 'mode=review'
    view.rerender(<CalendarPage />)
    expect(screen.getByTestId('calendar-import-content')).toHaveAttribute('data-review', 'true')
    expect(routerReplace).not.toHaveBeenCalled()
  })

  it('retires a review request observed before the account binds', () => {
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: true }
    calendarRouteSearch = 'mode=review'
    render(<CalendarPage />)
    expect(screen.getByTestId('calendar-import-content')).toBeInTheDocument()
    act(() => holdAccount('next-review-target-account'))
    expect(screen.queryByTestId('calendar-import-content')).not.toBeInTheDocument()
    expect(routerReplace).toHaveBeenCalledWith('/calendar')
  })

  it('passes a resolved empty Google events query as ready', () => {
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: true }
    isWideDesktopValue = true

    render(<CalendarPage />)

    expect(calendarDayDetailProps.calendarEventsState).toBe('ready')
    expect(calendarDayDetailProps.calendarEvents).toEqual([])
  })

  it('updates the inline day detail below the wide-desktop breakpoint', () => {
    render(<CalendarPage />)

    expect(screen.getByTestId('day-detail')).toBeDefined()

    fireEvent.click(screen.getByTestId('month-view'))
    expect(screen.getByTestId('day-detail')).toBeDefined()
    expect(calendarGridProps.selectedDateStr).toBe(calendarGridSelectionDate)
    expect(screen.queryByRole('button', { name: 'close-overlay' })).toBeNull()
  })

  it('seeds sync state without placing sync controls in day detail', () => {
    profileQueryState.profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: true,
      hasGoogleConnection: true, googleCalendarAutoSyncEnabled: true,
      googleCalendarAutoSyncStatus: 'Idle', googleCalendarLastSyncedAt: '2026-09-12T09:12:00Z' }
    render(<CalendarPage />)
    expect(autoSyncQueryOptions?.initialData).toEqual(autoSyncState)
    expect(calendarDayDetailProps.autoSyncState).toBeUndefined()
    expect(calendarDayDetailProps.onCalendarAutoSyncChange).toBeUndefined()
    expect(screen.queryByRole('switch', { name: 'calendar.dayDetail.autoSync' })).toBeNull()
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

  it('explains an offline empty-month create request in the month feedback', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    render(<CalendarPage />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.createHabit' }))
    expect(screen.getByText('offline.create.reason')).toBeVisible()
    fireEvent.click(screen.getByTestId('calendar-header'))
    expect(screen.queryByRole('button', { name: 'habits.createHabit' })).toBeNull()
    expect(screen.queryByText('offline.create.reason')).toBeNull()
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
    monthQueryState.dayMap = new Map([[getMockAccountDateKey(), [{
      habitId: 'habit-1',
      title: 'Habit',
      status: 'upcoming',
      isBadHabit: false,
      dueTime: '08:00',
      isOneTime: false,
    }]]])
    render(<CalendarPage />)

    expect(screen.queryByTestId('calendar-legend')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'calendar.options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'calendar.legendTitle' }))
    expect(screen.getByTestId('calendar-legend')).toBeDefined()
    expect(calendarStatsProps.state).toBe('default')
  })

  it('shows a retryable error card when the calendar query fails', () => {
    monthQueryState.error = 'network down'
    const page = render(<CalendarPage />)

    expect(useUIStore.getState().calendarHasError).toBe(true)
    expect(screen.queryByTestId('month-view')).toBeNull()
    expect(screen.getByText('calendar.loadError')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(monthQueryState.refresh).toHaveBeenCalledTimes(1)
    page.unmount()
    expect(useUIStore.getState().calendarHasError).toBe(false)
  })

  it('removes recurring habits from the month and shows its honest empty state', () => {
    const todayKey = getMockAccountDateKey()
    monthQueryState.dayMap = new Map([[todayKey, [{
      habitId: 'recurring',
      title: 'Recurring habit',
      status: 'upcoming',
      isBadHabit: false,
      dueTime: '08:00',
      isOneTime: false,
    }]]])
    render(<CalendarPage />)

    expect(screen.getByTestId('day-detail')).toBeDefined()
    expect(screen.getByTestId('month-stats')).toBeDefined()
    expect(screen.queryByRole('switch', { name: 'calendar.showRecurring' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'calendar.options' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'calendar.showRecurring' }))

    expect(calendarGridProps.dayMap?.get(todayKey)).toEqual([])
    expect(screen.getByTestId('month-stats').getAttribute('data-state')).toBe('empty')
    expect(screen.getByText('calendar.emptyMonth')).toBeDefined()
  })

  it('removes recurring status rings from the range picker when recurring is turned off', () => {
    const todayKey = getMockAccountDateKey()
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
    expect(screen.getByRole('img', { name: /calendar\.dayCell\.none 0 calendar\.dayCell\.of 1/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'calendar.options' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'calendar.showRecurring' }))

    expect(screen.queryByRole('img', { name: /calendar\.dayCell\.none 0 calendar\.dayCell\.of 1/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /calendar\.dayCell\.notScheduled/ })).toHaveLength(14)
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

  /**
   * The day panel's entries re-derive from the month query, which the account replacement empties,
   * so those are the next account's already. The open flag and the chosen day were copies, and a
   * replacement left the next account looking at a sheet the previous one opened.
   */
  describe('account replacement', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn())
      holdAccount('user-1')
    })

    afterEach(() => vi.unstubAllGlobals())

    it.each(['week', 'range', 'agenda'])('resets the %s period only on account replacement', async (view) => {
      const profile = { weekStartDay: 1, timeZone: 'UTC', hasProAccess: false }
      profileQueryState.profile = profile
      const page = render(<CalendarPage />)
      const radio = screen.getByRole('radio', { name: `calendar.view.${view}` })
      fireEvent.click(radio)
      const current = () => screen.getByRole('button', { name: /^calendar.period.goToCurrent/ })
      const initialPeriod = current().textContent
      fireEvent.click(screen.getByRole('button', { name: view === 'range' ? 'calendar.range.previous' : 'common.nextWeek' }))
      const browsedPeriod = current().textContent
      expect(browsedPeriod).not.toBe(initialPeriod)
      radio.focus()

      profileQueryState.profile = undefined
      page.rerender(<CalendarPage />)
      expect(current()).toHaveTextContent(browsedPeriod!)
      expect(radio).toHaveFocus()
      await recoverSameAccount('user-1')
      profileQueryState.profile = profile
      page.rerender(<CalendarPage />)
      expect(current()).toHaveTextContent(browsedPeriod!)

      profileQueryState.profile = undefined
      page.rerender(<CalendarPage />)
      await replaceAccountWith('user-2')
      expect(current()).toHaveTextContent(initialPeriod!)
      profileQueryState.profile = profile
      page.rerender(<CalendarPage />)
      expect(current()).toHaveTextContent(initialPeriod!)
      expect(screen.getByRole('radio', { name: `calendar.view.${view}` })).toBe(radio)
      expect(radio).toHaveFocus()
      expect(radio).toHaveAttribute('aria-checked', 'true')
    })

    it('closes the day panel the previous account opened and returns to today', async () => {
      render(<CalendarPage />)
      fireEvent.click(screen.getByTestId('month-view'))
      expect(screen.getByTestId('day-detail')).toBeInTheDocument()
      expect(calendarGridProps.selectedDateStr).toBe('2026-01-05')

      await replaceAccountWith('user-2')

      expect(screen.getByTestId('day-detail')).toBeInTheDocument()
      expect(calendarGridProps.selectedDateStr).toBe(formatAPIDate(new Date()))
    })

    it('keeps the day panel when the same account recovers from a rejected refresh', async () => {
      render(<CalendarPage />)
      fireEvent.click(screen.getByTestId('month-view'))

      await recoverSameAccount('user-1')

      expect(screen.getByTestId('day-detail')).toBeInTheDocument()
      expect(calendarGridProps.selectedDateStr).toBe('2026-01-05')
    })
  })
})
