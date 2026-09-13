import { useMemo } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { CalendarAutoSyncState, CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarSyncEvent } from '@orbit/shared'
import type { CalendarEventsDisplayState } from '@orbit/shared/utils'
import {
  getCalendarEntryMutationKey,
  useCalendarEntryMutationLock,
} from '@orbit/shared/hooks'

const translations: Record<string, string> = {
  'calendar.dayDetail.nothingDue': 'nothing due',
  'calendar.noHabitsScheduled': 'No habit was scheduled on this day.',
  'calendar.goToDay': 'Open this day on Today',
  'calendar.showRecurring': 'Show recurring habits',
  'calendar.status.completed': 'done',
  'calendar.status.missed': 'not logged',
  'calendar.status.indulged': 'indulged',
  'calendar.status.resisted': 'resisted',
  'calendar.status.upcoming': 'Upcoming',
  'calendar.autoSync.reconnectTitle': 'Google Calendar disconnected',
  'calendar.autoSync.reconnectBody': 'Auto-sync paused. Reconnect to resume.',
  'calendar.autoSync.reconnectCta': 'Reconnect',
  'calendar.proBoundary.title': 'Syncing with Google Calendar is part of Orbit Pro.',
  'calendar.proBoundary.body': 'With it, your commitments show up beside the habits for the day.',
  'calendar.proBoundary.action': 'See Pro',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === 'calendar.dayDetail.completionSummary') {
      return `${String(params?.done)} of ${String(params?.total)} logged`
    }
    return translations[key] ?? key
  },
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (time: string) => time }),
}))

vi.mock('@/hooks/use-date-format', () => ({
  useDateFormat: () => ({ displayWeekdayDate: () => 'Sunday, June 15' }),
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()
  return { ...actual, parseAPIDate: (date: string) => new Date(date) }
})

import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail'

const proAutoSyncState: CalendarAutoSyncState = {
  hasGoogleConnection: true,
  enabled: true,
  status: 'Idle',
  lastSyncedAt: '2026-09-12T09:12:00Z',
}

function makeEntry(overrides: Partial<CalendarDayEntry> = {}): CalendarDayEntry {
  return {
    habitId: '1',
    title: 'Meditate',
    status: 'completed',
    isBadHabit: false,
    dueTime: '08:00',
    isOneTime: false,
    ...overrides,
  }
}

interface RenderProps {
  dateStr?: string | null
  entries?: CalendarDayEntry[]
  calendarEvents?: CalendarSyncEvent[]
  hasProAccess?: boolean
  autoSyncState?: CalendarAutoSyncState
  onShowRecurringChange?: (value: boolean) => void
  onCalendarAutoSyncChange?: (value: boolean) => Promise<void>
  onOpenPro?: () => void
  calendarEventsState?: CalendarEventsDisplayState
  onRetryCalendarEvents?: () => void
  onReconnectCalendarEvents?: () => void
  onViewPro?: () => void
  loggable?: boolean
  showRecurring?: boolean
  onEntryChange?: (entry: CalendarDayEntry, checked: boolean) => Promise<void>
  fitViewport?: boolean
}

function CalendarDayDetailHarness({
  dateStr = '2025-06-15',
  entries = [],
  calendarEvents = [],
  hasProAccess = true,
  autoSyncState = proAutoSyncState,
  onShowRecurringChange = () => {},
  onCalendarAutoSyncChange = async () => {},
  onOpenPro = () => {},
  calendarEventsState = 'ready',
  onRetryCalendarEvents = () => {},
  onReconnectCalendarEvents = () => {},
  onViewPro = () => {},
  loggable = false,
  showRecurring = true,
  onEntryChange = async () => {},
  fitViewport = false,
}: RenderProps) {
  const sourceEntryStates = useMemo(() => {
    const states = new Map<string, boolean>()
    if (dateStr) {
      for (const entry of entries) {
        states.set(
          getCalendarEntryMutationKey(dateStr, entry.habitId),
          entry.status === 'completed',
        )
      }
    }
    return states
  }, [dateStr, entries])
  const { pendingEntryStates, startEntryMutation } = useCalendarEntryMutationLock(
    sourceEntryStates,
  )

  function changeEntry(entry: CalendarDayEntry, checked: boolean) {
    if (!dateStr) return null
    return startEntryMutation(
      getCalendarEntryMutationKey(dateStr, entry.habitId),
      checked,
      () => onEntryChange(entry, checked),
    )
  }

  return (
    <CalendarDayDetail
      key={dateStr ?? 'no-date'}
      dateStr={dateStr}
      entries={entries}
      calendarEvents={calendarEvents}
      hasProAccess={hasProAccess}
      autoSyncState={autoSyncState}
      calendarEventsState={calendarEventsState}
      onRetryCalendarEvents={onRetryCalendarEvents}
      onReconnectCalendarEvents={onReconnectCalendarEvents}
      onViewPro={onViewPro}
      loggable={loggable}
      showRecurring={showRecurring}
      pendingEntryStates={pendingEntryStates}
      onShowRecurringChange={onShowRecurringChange}
      onCalendarAutoSyncChange={onCalendarAutoSyncChange}
      onOpenPro={onOpenPro}
      onEntryChange={changeEntry}
      fitViewport={fitViewport}
    />
  )
}

function renderDetail(props: RenderProps = {}) {
  return render(<CalendarDayDetailHarness {...props} />)
}

describe('CalendarDayDetail', () => {
  it('renders nothing without a selected date', () => {
    const { container } = renderDetail({ dateStr: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps the summary and its own no-habits line when the day is empty', () => {
    renderDetail()
    expect(screen.getByText('nothing due')).toBeInTheDocument()
    expect(screen.getByText('No habit was scheduled on this day.')).toBeInTheDocument()
  })

  it('uses the selected-day card surface from the calendar canvas', () => {
    const { container } = renderDetail()
    const panel = container.querySelector('section')
    expect(panel).toHaveClass(
      'rounded-[var(--r-card)]',
      'bg-[var(--bg-card)]',
      'shadow-[inset_0_0_0_1px_var(--hairline-ghost)]',
    )
  })

  it('renders timed and all-day Google events as read-only context', () => {
    renderDetail({
      entries: [makeEntry({ title: 'Read' })],
      calendarEventsState: 'ready',
      calendarEvents: [
        {
          id: 'event-1',
          title: 'Team meeting',
          description: null,
          startDate: '2025-06-15',
          startTime: '09:00',
          endTime: null,
          isRecurring: false,
          recurrenceRule: null,
          reminders: [],
        },
        {
          id: 'event-2',
          title: 'Company holiday',
          description: null,
          startDate: '2025-06-15',
          startTime: null,
          endTime: null,
          isRecurring: false,
          recurrenceRule: null,
          reminders: [],
        },
      ],
    })

    expect(screen.getByText('calendar.dayDetail.eventsTitle')).toBeInTheDocument()
    const timedEvent = screen.getByRole('img', {
      name: '09:00, Team meeting, calendar.title',
    })
    const allDayEvent = screen.getByRole('img', {
      name: 'calendar.timeGrid.allDay, Company holiday, calendar.title',
    })
    expect(within(timedEvent).queryByRole('button')).toBeNull()
    expect(within(allDayEvent).queryByRole('button')).toBeNull()
  })

  it('keeps habit data visible while replacing Google events with the free plan boundary', () => {
    const onViewPro = vi.fn()
    renderDetail({
      dateStr: '2025-06-15',
      entries: [makeEntry({ title: 'Read' })],
      calendarEvents: [{
        id: 'event-1', title: 'Team meeting', description: null,
        startDate: '2025-06-15', startTime: '09:00', endTime: null,
        isRecurring: false, recurrenceRule: null, reminders: [],
      }],
      hasProAccess: false,
      calendarEventsState: 'pro-boundary',
      onViewPro,
    })

    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.queryByText('Team meeting')).not.toBeInTheDocument()
    const boundary = screen.getByTestId('calendar-pro-boundary')
    expect(within(boundary).getByText(
      'Syncing with Google Calendar is part of Orbit Pro.',
    )).toBeInTheDocument()
    expect(within(boundary).getByText(
      'With it, your commitments show up beside the habits for the day.',
    )).toBeInTheDocument()
    const upgradeAction = within(boundary).getByRole('button', { name: 'See Pro' })
    expect(upgradeAction).toHaveAttribute('data-variant', 'primary')
    expect(upgradeAction).not.toBeDisabled()
    expect(within(boundary).queryAllByRole('switch')).toHaveLength(0)
    fireEvent.click(upgradeAction)
    expect(onViewPro).toHaveBeenCalledOnce()
  })

  it('builds the Pro sync line and switch from the profile fields', () => {
    const onCalendarAutoSyncChange = vi.fn(async () => {})
    renderDetail({
      dateStr: '2025-06-15',
      entries: [makeEntry()],
      autoSyncState: proAutoSyncState,
      onCalendarAutoSyncChange,
    })

    expect(screen.getByText('calendar.dayDetail.googleConnected')).toBeInTheDocument()
    expect(document.body.textContent).toContain('calendar.dayDetail.lastSynced')
    const autoSync = screen.getByRole('switch', { name: 'calendar.dayDetail.autoSync' })
    expect(autoSync).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(autoSync)
    expect(onCalendarAutoSyncChange).toHaveBeenCalledWith(false)
  })

  it('does not offer auto-sync as enabled without a Google connection', () => {
    renderDetail({
      dateStr: '2025-06-15',
      entries: [makeEntry()],
      autoSyncState: { ...proAutoSyncState, hasGoogleConnection: false },
    })

    const switches = screen.queryAllByRole('switch', { name: 'calendar.dayDetail.autoSync' })
    expect(switches.every((control) => control.getAttribute('aria-checked') !== 'true')).toBe(true)
  })

  it('renders a failed events request instead of the empty result', () => {
    renderDetail({ entries: [makeEntry()], calendarEventsState: 'failed' })

    expect(screen.getByRole('alert')).toHaveTextContent('calendar.fetchError')
    expect(screen.queryByText('calendar.noEvents')).not.toBeInTheDocument()
  })

  it('renders the events loading treatment alone', () => {
    renderDetail({ entries: [makeEntry()], calendarEventsState: 'loading' })

    expect(screen.getByRole('progressbar', { name: 'calendar.fetchingEvents' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('calendar.noEvents')).not.toBeInTheDocument()
  })

  it('offers reconnection without rendering the connected-empty treatment', () => {
    const onReconnectCalendarEvents = vi.fn()
    renderDetail({
      entries: [makeEntry()],
      calendarEventsState: 'not-connected',
      onReconnectCalendarEvents,
    })
    expect(screen.getByText('Google Calendar disconnected')).toBeInTheDocument()
    expect(screen.getByText('Auto-sync paused. Reconnect to resume.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(onReconnectCalendarEvents).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('calendar.noEvents')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders the free sync boundary with one route to Orbit Pro', () => {
    const onViewPro = vi.fn()
    renderDetail({
      entries: [makeEntry()],
      calendarEventsState: 'pro-boundary',
      onViewPro,
    })

    const boundary = screen.getByTestId('calendar-pro-boundary')
    expect(boundary).toHaveTextContent('Syncing with Google Calendar is part of Orbit Pro.')
    expect(boundary).toHaveTextContent(
      'With it, your commitments show up beside the habits for the day.',
    )
    const actions = within(boundary).getAllByRole('button')
    expect(actions).toHaveLength(1)
    expect(actions[0]).toBeEnabled()
    expect(actions[0]).toHaveAttribute('data-variant', 'primary')
    fireEvent.click(actions[0]!)
    expect(onViewPro).toHaveBeenCalledTimes(1)
  })

  it('uses the neutral Pro action beside the wide sidebar action', () => {
    renderDetail({
      entries: [makeEntry()],
      calendarEventsState: 'pro-boundary',
      fitViewport: true,
    })

    expect(
      within(screen.getByTestId('calendar-pro-boundary')).getByRole('button'),
    ).toHaveAttribute('data-variant', 'secondary')
  })

  it('renders the empty events state after an empty response resolves', () => {
    renderDetail({ entries: [makeEntry()], calendarEventsState: 'ready' })

    expect(screen.getByText('calendar.noEvents')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps ordinary upcoming rows distinct from completed and missed outcomes', () => {
    renderDetail({
      entries: [
        makeEntry({ title: 'Read' }),
        makeEntry({ habitId: '2', title: 'Walk', dueTime: '09:00', status: 'missed' }),
        makeEntry({ habitId: '3', title: 'Swim', dueTime: '10:00', status: 'upcoming' }),
      ],
    })

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText('08:00 · done')).toBeInTheDocument()
    expect(screen.getByText('09:00 · not logged')).toBeInTheDocument()
    expect(screen.getByText('10:00 · Upcoming')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'done' })).toHaveAttribute('data-status', 'done')
    expect(screen.getByRole('img', { name: 'not logged' })).toHaveAttribute('data-status', 'empty')
    expect(screen.getByRole('img', { name: 'Upcoming' })).toHaveAttribute('data-status', 'empty')
  })

  it('keeps avoid-habit upcoming rows distinct from indulged and resisted outcomes', () => {
    renderDetail({
      entries: [
        makeEntry({ title: 'Sweets', isBadHabit: true }),
        makeEntry({ habitId: '2', title: 'Smoking', isBadHabit: true, status: 'missed' }),
        makeEntry({ habitId: '3', title: 'Beer', isBadHabit: true, status: 'upcoming' }),
      ],
    })

    expect(screen.getByText('08:00 · indulged')).toBeInTheDocument()
    expect(screen.getByText('08:00 · resisted')).toBeInTheDocument()
    expect(screen.getByText('08:00 · Upcoming')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'indulged' })).toHaveAttribute('data-status', 'bad')
    expect(screen.getByRole('img', { name: 'resisted' })).toHaveAttribute('data-status', 'done')
    expect(screen.getByRole('img', { name: 'Upcoming' })).toHaveAttribute('data-status', 'empty')
  })

  it('uses check rows on loggable days and reports the requested state', () => {
    const entry = makeEntry({ title: 'Read' })
    const onEntryChange = vi.fn(async () => {})
    renderDetail({ entries: [entry], loggable: true, onEntryChange })

    const row = screen.getByRole('checkbox', { name: 'Read' })
    expect(within(row).getByText('08:00 · done')).toBeInTheDocument()
    fireEvent.click(row)
    expect(onEntryChange).toHaveBeenCalledWith(entry, false)
  })

  it('keeps current-day unchecks upcoming before their writes settle', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-15T00:00:00Z'))
    const pendingChange = new Promise<void>(() => {})

    try {
      renderDetail({
        entries: [
          makeEntry({ title: 'Read' }),
          makeEntry({ habitId: '2', title: 'Sweets', isBadHabit: true }),
        ],
        loggable: true,
        onEntryChange: () => pendingChange,
      })

      fireEvent.click(screen.getByRole('checkbox', { name: 'Read' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Sweets' }))

      expect(screen.getAllByText('08:00 · Upcoming')).toHaveLength(2)
      expect(screen.queryByText('08:00 · not logged')).not.toBeInTheDocument()
      expect(screen.queryByText('08:00 · resisted')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses a second request when source reconciliation lands mid-toggle', () => {
    const pendingChange = new Promise<void>(() => {})
    const entry = makeEntry({ title: 'Read', status: 'missed' })
    const onEntryChange = vi.fn(() => pendingChange)
    const rendered = renderDetail({ entries: [entry], loggable: true, onEntryChange })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Read' }))
    rendered.rerender(
      <CalendarDayDetailHarness
        dateStr="2025-06-15"
        entries={[{ ...entry, status: 'completed' }]}
        loggable
        showRecurring
        onEntryChange={onEntryChange}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Read' }))

    expect(onEntryChange).toHaveBeenCalledTimes(1)
  })

  it('shows the next day server state without carrying over a pending toggle', () => {
    const pendingChange = new Promise<void>(() => {})
    const dayAEntry = makeEntry({ title: 'Read', status: 'missed' })
    const dayBEntry = makeEntry({ title: 'Read', status: 'missed' })
    const onEntryChange = vi.fn(() => pendingChange)
    const rendered = renderDetail({ entries: [dayAEntry], loggable: true, onEntryChange })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Read' }))
    rendered.rerender(
      <CalendarDayDetailHarness
        dateStr="2025-06-16"
        entries={[dayBEntry]}
        loggable
        showRecurring
        onEntryChange={onEntryChange}
      />,
    )

    const dayBRow = screen.getByRole('checkbox', { name: 'Read' })
    expect(dayBRow).toHaveAttribute('aria-checked', 'false')
    expect(dayBRow).toBeEnabled()
    fireEvent.click(dayBRow)
    expect(onEntryChange).toHaveBeenCalledTimes(2)
    expect(onEntryChange).toHaveBeenLastCalledWith(dayBEntry, true)
  })

  it('keeps a returning day locked until its pending toggle settles', async () => {
    let resolveChange: (() => void) | undefined
    const pendingChange = new Promise<void>((resolve) => {
      resolveChange = resolve
    })
    const entry = makeEntry({ title: 'Read', status: 'missed' })
    const onEntryChange = vi.fn(() => pendingChange)
    const rendered = renderDetail({ entries: [entry], loggable: true, onEntryChange })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Read' }))
    rendered.rerender(
      <CalendarDayDetailHarness
        dateStr="2025-06-16"
        entries={[entry]}
        loggable
        showRecurring
        onEntryChange={onEntryChange}
      />,
    )
    rendered.rerender(
      <CalendarDayDetailHarness
        dateStr="2025-06-15"
        entries={[entry]}
        loggable
        showRecurring
        onEntryChange={onEntryChange}
      />,
    )

    const returnedRow = screen.getByRole('checkbox', { name: 'Read' })
    expect(returnedRow).toBeDisabled()
    fireEvent.click(returnedRow)
    expect(onEntryChange).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveChange?.()
      await pendingChange
    })

    const settledReturnedRow = screen.getByRole('checkbox', { name: 'Read' })
    expect(settledReturnedRow).toBeDisabled()
    fireEvent.click(settledReturnedRow)
    expect(onEntryChange).toHaveBeenCalledTimes(1)

    rendered.rerender(
      <CalendarDayDetailHarness
        dateStr="2025-06-15"
        entries={[{ ...entry, status: 'completed' }]}
        loggable
        showRecurring
        onEntryChange={onEntryChange}
      />,
    )

    expect(screen.getByRole('checkbox', { name: 'Read' })).toBeEnabled()
  })

  it('restores and enables a returned day when rejected source data changes identity', async () => {
    let rejectChange: ((reason?: unknown) => void) | undefined
    const pendingChange = new Promise<void>((_resolve, reject) => {
      rejectChange = reject
    })
    const entry = makeEntry({ title: 'Read', status: 'missed' })
    const onEntryChange = vi.fn(() => pendingChange)
    const rendered = renderDetail({ entries: [entry], loggable: true, onEntryChange })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Read' }))
    rendered.rerender(
      <CalendarDayDetailHarness
        dateStr="2025-06-16"
        entries={[entry]}
        loggable
        showRecurring
        onEntryChange={onEntryChange}
      />,
    )
    rendered.rerender(
      <CalendarDayDetailHarness
        dateStr="2025-06-15"
        entries={[entry]}
        loggable
        showRecurring
        onEntryChange={onEntryChange}
      />,
    )

    await act(async () => {
      rejectChange?.(new Error('write failed'))
      await pendingChange.catch(() => {})
    })

    const rejectedRow = screen.getByRole('checkbox', { name: 'Read' })
    expect(rejectedRow).toHaveAttribute('aria-checked', 'false')
    expect(rejectedRow).toBeEnabled()

    rendered.rerender(
      <CalendarDayDetailHarness
        dateStr="2025-06-15"
        entries={[{ ...entry }]}
        loggable
        showRecurring
        onEntryChange={onEntryChange}
      />,
    )

    expect(screen.getByRole('checkbox', { name: 'Read' })).toBeEnabled()
  })

  it('restores and enables a returned day after rejection with identical source data', async () => {
    let rejectChange: ((reason?: unknown) => void) | undefined
    const pendingChange = new Promise<void>((_resolve, reject) => {
      rejectChange = reject
    })
    const entry = makeEntry({ title: 'Read', status: 'missed' })
    const onEntryChange = vi.fn(() => pendingChange)
    const rendered = renderDetail({ entries: [entry], loggable: true, onEntryChange })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Read' }))
    rendered.rerender(
      <CalendarDayDetailHarness
        dateStr="2025-06-16"
        entries={[entry]}
        loggable
        showRecurring
        onEntryChange={onEntryChange}
      />,
    )
    rendered.rerender(
      <CalendarDayDetailHarness
        dateStr="2025-06-15"
        entries={[entry]}
        loggable
        showRecurring
        onEntryChange={onEntryChange}
      />,
    )

    await act(async () => {
      rejectChange?.(new Error('write failed'))
      await pendingChange.catch(() => {})
    })

    const rejectedRow = screen.getByRole('checkbox', { name: 'Read' })
    expect(rejectedRow).toHaveAttribute('aria-checked', 'false')
    expect(rejectedRow).toBeEnabled()
  })

  it('controls and serializes a row toggle, then rolls it back when the write fails', async () => {
    let rejectChange: ((reason?: unknown) => void) | undefined
    const pendingChange = new Promise<void>((_resolve, reject) => {
      rejectChange = reject
    })
    const entry = makeEntry({ title: 'Read', status: 'missed' })
    const onEntryChange = vi.fn(() => pendingChange)
    const rendered = renderDetail({ entries: [entry], loggable: true, onEntryChange })

    const row = screen.getByRole('checkbox', { name: 'Read' })
    fireEvent.click(row)

    expect(row).toHaveAttribute('aria-checked', 'true')
    expect(row).toBeDisabled()
    expect(within(row).getByText('08:00 · done')).toBeInTheDocument()
    fireEvent.click(row)
    expect(onEntryChange).toHaveBeenCalledTimes(1)

    await act(async () => {
      rejectChange?.(new Error('write failed'))
      await pendingChange.catch(() => {})
    })

    expect(row).toHaveAttribute('aria-checked', 'false')
    expect(row).toBeEnabled()
    expect(within(row).getByText('08:00 · not logged')).toBeInTheDocument()

    rendered.rerender(
      <CalendarDayDetailHarness
        dateStr="2025-06-15"
        entries={[{ ...entry }]}
        loggable
        showRecurring
        onEntryChange={onEntryChange}
      />,
    )

    expect(screen.getByRole('checkbox', { name: 'Read' })).toBeEnabled()
  })

  it('summarizes the filtered rows and keeps the no-habits line when recurring rows are hidden', () => {
    renderDetail({
      showRecurring: false,
      entries: [makeEntry({ title: 'Recurring', isOneTime: false })],
    })
    expect(screen.getByText('nothing due')).toBeInTheDocument()
    expect(screen.getByText('No habit was scheduled on this day.')).toBeInTheDocument()
    expect(screen.queryByText('Recurring')).not.toBeInTheDocument()
  })

  it('leaves for Today through the panel row with the selected date', () => {
    renderDetail()
    expect(screen.getByRole('link', { name: 'Open this day on Today' })).toHaveAttribute(
      'href',
      '/?date=2025-06-15',
    )
  })

  it('keeps the route row outside the desktop scroll region', () => {
    const { container } = renderDetail({ entries: [makeEntry()], fitViewport: true })
    const scroller = container.querySelector('[data-calendar-day-scroll]') as HTMLElement
    const routeRow = screen.getByRole('link', { name: 'Open this day on Today' })
    expect(scroller).not.toBeNull()
    expect(scroller).not.toContainElement(routeRow)
  })
})
