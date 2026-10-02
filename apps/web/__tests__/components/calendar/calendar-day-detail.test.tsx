import { buildCalendarDayMap } from '@orbit/shared/utils'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'
import { useMemo } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { CalendarAutoSyncState, CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarSyncEvent } from '@orbit/shared'
import type { CalendarEventsDisplayState } from '@orbit/shared/utils'
import {
  getCalendarEntryMutationKey,
} from '@orbit/shared/hooks'
import { useCalendarEntryMutationLock } from '@/hooks/use-calendar-entry-mutation-lock'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const detailLocale = vi.hoisted(() => ({ language: 'en' }))
const network = vi.hoisted(() => ({ isOnline: true }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: network.isOnline }) }))

const translations: Record<string, string> = {
  'calendar.dayDetail.nothingDue': 'nothing due',
  'calendar.noHabitsScheduled': 'No habit was scheduled on this day.',
  'calendar.goToDay': en.calendar.goToDay,
  'calendar.showRecurring': 'Show recurring habits',
  'calendar.status.completed': en.calendar.status.completed,
  'calendar.status.missed': en.calendar.status.missed,
  'calendar.status.indulged': en.calendar.status.indulged,
  'calendar.status.resisted': en.calendar.status.resisted,
  'calendar.dayDetail.disconnectedTitle': 'Google Calendar disconnected',
  'calendar.dayDetail.disconnectedBody': 'Reconnect to see the events you can import.',
  'calendar.dayDetail.noEventsToImport': 'No Google Calendar events on this day.',
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
    if (key === 'dates.today') return detailLocale.language === 'en' ? en.dates.today : ptBR.dates.today
    return translations[key] ?? key
  },
  useLocale: () => detailLocale.language,
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (time: string) => time }),
}))

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
  autoSyncState?: CalendarAutoSyncState
  onCalendarAutoSyncChange?: (value: boolean) => Promise<void>
  calendarEventsState?: CalendarEventsDisplayState
  onRetryCalendarEvents?: () => void
  onReconnectCalendarEvents?: () => void
  onOpenCalendarImport?: (eventId: string | null) => void
  onViewPro?: () => void
  loggable?: boolean
  showRecurring?: boolean
  onEntryChange?: (entry: CalendarDayEntry, checked: boolean) => Promise<void>
  proActionVariant?: 'primary' | 'secondary'
}

function CalendarDayDetailHarness({
  dateStr = '2025-06-15',
  entries = [],
  calendarEvents = [],
  autoSyncState = proAutoSyncState,
  onCalendarAutoSyncChange = async () => {},
  calendarEventsState = 'ready',
  onRetryCalendarEvents = () => {},
  onReconnectCalendarEvents = () => {},
  onOpenCalendarImport = () => {},
  onViewPro = () => {},
  loggable = false,
  showRecurring = true,
  onEntryChange = async () => {},
  proActionVariant = 'primary',
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
      today="2025-06-15"
      entries={entries}
      calendarEvents={calendarEvents}
      autoSyncState={autoSyncState}
      calendarEventsState={calendarEventsState}
      onRetryCalendarEvents={onRetryCalendarEvents}
      onOpenCalendarImport={onOpenCalendarImport}
      onReconnectCalendarEvents={onReconnectCalendarEvents}
      onViewPro={onViewPro}
      loggable={loggable}
      showRecurring={showRecurring}
      pendingEntryStates={pendingEntryStates}
      onCalendarAutoSyncChange={onCalendarAutoSyncChange}
      onCalendarSyncNow={async () => {}}
      onEntryChange={changeEntry}
      proActionVariant={proActionVariant}
    />
  )
}

function renderDetail(props: RenderProps = {}) {
  return render(<CalendarDayDetailHarness {...props} />)
}

describe('CalendarDayDetail', () => {
  describe.each(['UTC', 'America/Sao_Paulo', 'Pacific/Auckland'])('day card headings in %s', (timeZone) => {
    it.each([
      ['en', 'Today, June 15', 'Saturday, June 14'],
      ['pt-BR', 'Hoje, 15 de junho', 'Sábado, 14 de junho'],
    ])('renders the drawn day card heading in %s', (locale, todayTitle, otherTitle) => {
      const originalTimeZone = process.env.TZ
      process.env.TZ = timeZone
      detailLocale.language = locale
      try {
        const view = renderDetail()
        expect(screen.getByText(todayTitle)).toBeDefined()
        view.unmount()
        const otherView = renderDetail({ dateStr: '2025-06-14' })
        expect(screen.getByText(otherTitle)).toBeDefined()
        otherView.unmount()
      } finally {
        detailLocale.language = 'en'
        if (originalTimeZone === undefined) delete process.env.TZ
        else process.env.TZ = originalTimeZone
      }
    })
  })

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
    const onOpenCalendarImport = vi.fn()
    renderDetail({
      entries: [makeEntry({ title: 'Read' })],
      onOpenCalendarImport,
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
          calendarName: 'Work',
          isImported: false,
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
          calendarName: 'Personal',
          isImported: true,
          importedHabitId: '4a16a8be-cd9b-4baf-bcaf-ec0ce6d59dfa',
        },
      ],
    })

    expect(screen.getByText('calendar.dayDetail.eventsTitle')).toBeInTheDocument()
    const timedEvent = screen.getByRole('img', {
      name: '09:00, Team meeting, Work',
    })
    const allDayEvent = screen.getByRole('img', {
      name: 'calendar.timeGrid.allDay, Company holiday, Personal',
    })
    expect(within(timedEvent).queryByRole('button')).toBeNull()
    expect(within(allDayEvent).queryByRole('button')).toBeNull()
    const importAction = screen.getByRole('button', { name: 'calendar.dayDetail.importEvents' })
    expect(importAction).toHaveAttribute('data-size', 'sm')
    expect(importAction.closest('[data-slot=action-row]')).not.toBeNull()
    expect(timedEvent.parentElement?.querySelectorAll('button')).toHaveLength(1)
    fireEvent.click(importAction)
    expect(onOpenCalendarImport).toHaveBeenCalledWith(null)
    expect(screen.queryByRole('button', { name: /Company holiday/ })).toBeNull()
  })

  it('searches and pages a busy day without growing the event list past twenty rows', () => {
    const calendarEvents: CalendarSyncEvent[] = Array.from({ length: 23 }, (_, index) => ({
      id: `event-${index}`, title: `Event ${index}`, description: null,
      startDate: '2025-06-15', startTime: '09:00', endTime: null,
      isRecurring: false, recurrenceRule: null, reminders: [],
    }))
    renderDetail({ calendarEvents })

    expect(screen.getByRole('textbox', { name: 'calendar.dayDetail.searchEvents' })).toBeInTheDocument()
    expect(screen.getByText('Event 19')).toBeInTheDocument()
    expect(screen.queryByText('Event 20')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.next' }))
    expect(screen.getByText('Event 20')).toBeInTheDocument()
    expect(screen.queryByText('Event 0')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'calendar.dayDetail.searchEvents' }), { target: { value: 'Event 22' } })
    expect(screen.getByText('Event 22')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.next' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'calendar.dayDetail.searchEvents' }), { target: { value: 'No such event' } })
    expect(screen.getByText('calendar.dayDetail.noMatchingEvents')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'calendar.dayDetail.clearEventSearch' }))
    expect(screen.getByText('Event 0')).toBeInTheDocument()
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

  it('refuses calendar sync beside the day control while offline', () => {
    network.isOnline = false
    try {
      const onCalendarAutoSyncChange = vi.fn(async () => {})
      renderDetail({ autoSyncState: proAutoSyncState, onCalendarAutoSyncChange })
      expect(screen.getByText('offline.calendar.title')).toBeInTheDocument()
      expect(screen.getByText('offline.calendar.reason')).toBeInTheDocument()
      const autoSync = screen.getByRole('switch', { name: 'calendar.dayDetail.autoSync' })
      expect(autoSync).toBeDisabled()
      fireEvent.click(autoSync)
      expect(onCalendarAutoSyncChange).not.toHaveBeenCalled()
    } finally {
      network.isOnline = true
    }
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

  it('refuses disconnected calendar reconnection in place while offline', () => {
    network.isOnline = false
    try {
      const onReconnectCalendarEvents = vi.fn()
      renderDetail({
        calendarEventsState: 'not-connected',
        autoSyncState: { ...proAutoSyncState, hasGoogleConnection: false },
        onReconnectCalendarEvents,
      })
      expect(screen.getByText('offline.calendar.reason')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument()
      expect(onReconnectCalendarEvents).not.toHaveBeenCalled()
    } finally {
      network.isOnline = true
    }
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
    expect(screen.getByText('Reconnect to see the events you can import.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(onReconnectCalendarEvents).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('calendar.noEvents')).not.toBeInTheDocument()
    expect(document.querySelector('[data-calendar-sync-line]')).toBeNull()
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
      proActionVariant: 'secondary',
    })

    expect(
      within(screen.getByTestId('calendar-pro-boundary')).getByRole('button'),
    ).toHaveAttribute('data-variant', 'secondary')
  })

  it('renders the empty events state after an empty response resolves', () => {
    renderDetail({ entries: [makeEntry()], calendarEventsState: 'ready' })

    expect(
      screen.getByText('No Google Calendar events on this day.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('labels an unlogged ordinary row like a missed row', () => {
    renderDetail({
      entries: [
        makeEntry({ title: 'Read' }),
        makeEntry({ habitId: '2', title: 'Walk', dueTime: '09:00', status: 'missed' }),
        makeEntry({ habitId: '3', title: 'Swim', dueTime: '10:00', status: 'upcoming' }),
      ],
    })

    expect(screen.getByText('Read').closest('.orbit-list-row-shell')?.firstElementChild).toHaveStyle({ minHeight: 'var(--row-h-compact)' })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText('08:00 · done')).toBeInTheDocument()
    expect(screen.getByText('09:00 · not logged')).toBeInTheDocument()
    expect(screen.getByText('10:00 · not logged')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'done' })).toHaveAttribute('data-status', 'done')
    expect(screen.getAllByRole('img', { name: 'not logged' })).toHaveLength(2)
    expect(screen.getAllByRole('img', { name: 'not logged' }).every((ring) => ring.getAttribute('data-status') === 'empty')).toBe(true)
  })

  it('labels an unlogged avoid-habit row like a resisted row', () => {
    renderDetail({
      entries: [
        makeEntry({ title: 'Sweets', isBadHabit: true }),
        makeEntry({ habitId: '2', title: 'Smoking', isBadHabit: true, status: 'missed' }),
        makeEntry({ habitId: '3', title: 'Beer', isBadHabit: true, status: 'upcoming' }),
      ],
    })

    expect(screen.getByText('08:00 · indulged')).toBeInTheDocument()
    expect(screen.getAllByText('08:00 · resisted')).toHaveLength(2)
    expect(screen.getByRole('img', { name: 'indulged' })).toHaveAttribute('data-status', 'bad')
    expect(screen.getByRole('img', { name: 'resisted' })).toHaveAttribute('data-status', 'done')
    expect(screen.getByRole('img', { name: 'not logged' })).toHaveAttribute('data-status', 'empty')
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

      expect(within(screen.getByRole('checkbox', { name: 'Read' })).getByText('08:00 · not logged')).toBeInTheDocument()
      expect(within(screen.getByRole('checkbox', { name: 'Sweets' })).getByText('08:00 · resisted')).toBeInTheDocument()
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
    expect(screen.getByText('Open this day on Today')).toHaveClass('break-words')
  })

  it('keeps the title, summary and route within a 24px inset card', () => {
    const { container } = renderDetail({ entries: [makeEntry()] })
    const card = container.querySelector('section') as HTMLElement
    expect(card.style.paddingBlock).toBe('24px')
    expect(card).toContainElement(screen.getByRole('heading', { level: 2 }))
    expect(card).toContainElement(screen.getByText('1 of 1 logged'))
    expect(card).toContainElement(screen.getByRole('link', { name: 'Open this day on Today' }))
    expect(screen.getByRole('heading', { level: 2 }).parentElement).toHaveStyle({ paddingInline: '24px' })
    expect(screen.getByText('Meditate').closest('[style*="padding-inline: 8px"]')).not.toBeNull()
    expect(screen.queryByRole('switch', { name: 'Show recurring habits' })).not.toBeInTheDocument()
  })

})


describe('CalendarDayDetail mixed-type family carry', () => {
  const loggedDate = '2026-09-28'
    function badParentWithGoodChildLog(): CalendarMonthResponse {
      return {
        habits: [
          createMockHabitScheduleItem({
            id: 'bad-parent',
            title: 'Bad parent',
            isBadHabit: true,
            frequencyUnit: 'Week',
            dueDate: '2026-09-29',
            scheduledDates: ['2026-09-29'],
            instances: [{ date: '2026-09-29', status: 'Pending', logId: null }],
            children: [
              createMockHabitScheduleChild({
                id: 'good-child',
                title: 'Good child',
                frequencyUnit: 'Week',
                frequencyQuantity: 3,
                dueDate: '2026-10-19',
                scheduledDates: [loggedDate],
                isLoggedInRange: true,
                instances: [{ date: loggedDate, status: 'Completed', logId: 'good-child-log' }],
              }),
            ],
            hasSubHabits: true,
          }),
        ],
        logs: { 'bad-parent': [] },
      }
    }

  it('labels a good sub-habit log under a bad parent as completed, not as a slip', () => {
    const dayMap = buildCalendarDayMap(badParentWithGoodChildLog(),
      { from: '2026-09-01', to: '2026-09-30' }, new Date('2026-09-29T12:00:00'))
    renderDetail({ dateStr: loggedDate, entries: dayMap.get(loggedDate) ?? [] })
    expect(screen.getByText('Good child')).toBeInTheDocument()
    expect(screen.getByLabelText(en.calendar.status.completed)).toBeInTheDocument()
    expect(screen.queryByLabelText(en.calendar.status.indulged)).not.toBeInTheDocument()
    expect(screen.queryByText('Bad parent')).not.toBeInTheDocument()
  })
})
