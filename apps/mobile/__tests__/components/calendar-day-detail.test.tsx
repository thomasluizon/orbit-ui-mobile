import { buildCalendarDayMap } from '@orbit/shared/utils'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { TFunction } from 'i18next'
import type { CalendarAutoSyncState, CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarSyncEvent } from '@orbit/shared'
import en from '@orbit/shared/i18n/en.json'
import type { CalendarEventsDisplayState } from '@orbit/shared/utils'
import {
  getCalendarEntryMutationKey,
} from '@orbit/shared/hooks'
import { useCalendarEntryMutationLock } from '@/hooks/use-calendar-entry-mutation-lock'
import { createTokensV2 } from '@/lib/theme'
import { CalendarDayDetail } from '@/app/(tabs)/calendar/_components/calendar-day-detail'

const TestRenderer = require('react-test-renderer')
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))


const network = { isOnline: true }
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => network }))

vi.mock('@/components/ui/list-row', () => ({
  ListRow: (props: Record<string, unknown>) => React.createElement('ListRowMock', props),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, variant = 'primary', ...props }: {
    children?: React.ReactNode
    variant?: string
  }) => React.createElement('PillButtonMock', { ...props, variant }, children),
}))

vi.mock('@/components/ui/capacity-notice', () => ({
  CapacityNotice: ({ message, body, action }: Record<string, unknown>) =>
    React.createElement('CapacityNoticeMock', { message, body }, action as React.ReactNode),
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, label, onChange }: {
    checked: boolean
    label: string
    onChange: (value: boolean) => void
  }) => React.createElement('SwitchMock', {
    accessibilityLabel: label,
    accessibilityState: { checked },
    onPress: () => onChange(!checked),
  }),
}))

vi.mock('@/components/ui/check-row', () => ({
  CheckRow: (props: Record<string, unknown>) => React.createElement('CheckRowMock', props),
}))

vi.mock('@/components/ui/status-ring', () => ({
  StatusRing: (props: Record<string, unknown>) => React.createElement('StatusRingMock', props),
}))

vi.mock('@/app/(tabs)/calendar/_components/show-recurring-toggle', () => ({
  ShowRecurringToggle: () => React.createElement('ShowRecurringToggleMock'),
}))

vi.mock('@/components/dates/event-row', () => ({
  EventRow: (props: Record<string, unknown>) => React.createElement('EventRowMock', props),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: Record<string, unknown>) => React.createElement('InputMock', props),
}))

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

type Tree = {
  root: {
    findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
  }
  update: (element: React.ReactElement) => void
}

const translations: Record<string, string> = {
  'calendar.dayDetail.nothingDue': 'nothing due',
  'calendar.noHabitsScheduled': 'No habit was scheduled on this day.',
  'calendar.goToDay': en.calendar.goToDay,
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

const translate = ((key: string, params?: Record<string, unknown>) => {
  if (key === 'calendar.dayDetail.completionSummary') {
    return `${String(params?.done)} of ${String(params?.total)} logged`
  }
  return translations[key] ?? key
}) as unknown as TFunction

const proAutoSyncState: CalendarAutoSyncState = {
  hasGoogleConnection: true,
  enabled: true,
  status: "Idle",
  lastSyncedAt: "2026-09-12T09:12:00Z",
};

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

interface RenderDetailProps {
  selectedDate?: string
  entries?: CalendarDayEntry[]
  calendarEvents?: CalendarSyncEvent[]
  autoSyncState?: CalendarAutoSyncState
  calendarEventsState?: CalendarEventsDisplayState
  onRetryCalendarEvents?: () => void
  onReconnectCalendarEvents?: () => void
  onOpenCalendarImport?: (eventId: string | null) => void
  onViewPro?: () => void
  loggable?: boolean
  onCalendarAutoSyncChange?: (value: boolean) => Promise<void>
  onEntryChange?: (entry: CalendarDayEntry, checked: boolean) => Promise<void>
  onGoToDay?: () => void
}

function CalendarDayDetailHarness({
  selectedDate = '2025-06-15',
  entries = [],
  calendarEvents = [],
  autoSyncState = proAutoSyncState,
  calendarEventsState = 'ready',
  onRetryCalendarEvents = () => {},
  onReconnectCalendarEvents = () => {},
  onOpenCalendarImport = () => {},
  onViewPro = () => {},
  loggable = false,
  onCalendarAutoSyncChange = async () => {},
  onEntryChange = async () => {},
  onGoToDay = () => {},
}: RenderDetailProps): React.ReactElement {
  const tokens = createTokensV2('purple', 'dark')
  const sourceEntryStates = React.useMemo(
    () => new Map(entries.map((entry) => [
      getCalendarEntryMutationKey(selectedDate, entry.habitId),
      entry.status === 'completed',
    ])),
    [entries, selectedDate],
  )
  const { pendingEntryStates, startEntryMutation } = useCalendarEntryMutationLock(
    sourceEntryStates,
  )

  function changeEntry(entry: CalendarDayEntry, checked: boolean) {
    return startEntryMutation(
      getCalendarEntryMutationKey(selectedDate, entry.habitId),
      checked,
      () => onEntryChange(entry, checked),
    )
  }

  return (
    <CalendarDayDetail
      key={selectedDate}
      selectedDate={selectedDate}
      title='Sunday, Jun 15'
      filteredEntries={entries}
      calendarEvents={calendarEvents}
      calendarEventsState={calendarEventsState}
      onRetryCalendarEvents={onRetryCalendarEvents}
      onOpenCalendarImport={onOpenCalendarImport}
      onReconnectCalendarEvents={onReconnectCalendarEvents}
      onViewPro={onViewPro}
      completedCount={entries.filter((entry) => entry.status === 'completed').length}
      loggable={loggable}
      pendingEntryStates={pendingEntryStates}
      onEntryChange={changeEntry}
      onGoToDay={onGoToDay}
      displayTime={(time) => time}
      t={translate}
      tokens={tokens}
    />
  )
}

function detailElement(props: RenderDetailProps = {}): React.ReactElement {
  return <CalendarDayDetailHarness {...props} />
}

function renderDetail(props: RenderDetailProps = {}): Tree {
  let tree: Tree
  TestRenderer.act(() => {
    tree = TestRenderer.create(detailElement(props))
  })
  return tree!
}

function nodes(tree: Tree, type: string): TestNode[] {
  return tree.root.findAll((node) => node.type === type)
}

describe('CalendarDayDetail (mobile)', () => {
  it('keeps the summary and its own no-habits line when the day is empty', () => {
    const tree = renderDetail()
    const text = nodes(tree, 'Text').map((node) => node.props.children)
    expect(text).toContain('nothing due')
    expect(text).toContain('No habit was scheduled on this day.')
  })

  it('uses the selected-day card surface from the calendar canvas', () => {
    const tree = renderDetail()
    expect(nodes(tree, 'View')[0]?.props.style).toMatchObject({
      backgroundColor: 'rgba(250,250,250,0.04)',
      borderColor: 'rgba(255,255,255,0.10)',
      borderRadius: 20,
      borderWidth: 1,
      paddingVertical: 24,
    })
    expect(nodes(tree, 'View').some((node) => (node.props.style as { paddingHorizontal?: number } | undefined)?.paddingHorizontal === 16)).toBe(true)
    expect(nodes(tree, 'View').some((node) => (node.props.style as { gap?: number } | undefined)?.gap === 8)).toBe(true)
    expect(nodes(tree, 'Text').some((node) => node.props.children === 'Sunday, Jun 15')).toBe(true)
    expect(nodes(tree, 'Pressable').some((node) => node.props.accessibilityLabel === 'Show recurring habits')).toBe(false)
  })

  it('opens timed and all-day events without an import pill', () => {
    const onOpenCalendarImport = vi.fn()
    const tree = renderDetail({ onOpenCalendarImport, calendarEvents: [
      { id: 'event-1', title: 'Team meeting', description: null, startDate: '2025-06-15', startTime: '09:00', endTime: null, isRecurring: false, recurrenceRule: null, reminders: [], calendarName: 'Work' },
      { id: 'event-2', title: 'Holiday', description: null, startDate: '2025-06-15', startTime: null, endTime: null, isRecurring: false, recurrenceRule: null, reminders: [], calendarName: 'Work' },
    ] })
    const rows = nodes(tree, 'EventRowMock')
    expect(rows[0]?.props).toMatchObject({ title: 'Team meeting', time: '09:00', source: undefined })
    expect(rows[1]?.props.allDayLabel).toBe('calendar.timeGrid.allDay')
    TestRenderer.act(() => (rows[1]?.props.onClick as () => void)())
    expect(onOpenCalendarImport).toHaveBeenCalledWith('event-2')
    expect(nodes(tree, 'PillButtonMock')).toHaveLength(0)
  })

  it('renders a failed events request instead of the empty result', () => {
    const tree = renderDetail({ entries: [makeEntry()], calendarEventsState: 'failed' })
    const errors = nodes(tree, 'Text').filter(
      (node) => node.props.accessibilityLabel === 'calendar.fetchError',
    )
    const empty = nodes(tree, 'Text').filter(
      (node) => node.props.children === 'calendar.noEvents',
    )

    expect(errors).toHaveLength(1)
    expect(empty).toHaveLength(0)
  })

  it('renders the events loading treatment alone', () => {
    const tree = renderDetail({ entries: [makeEntry()], calendarEventsState: 'loading' })
    const loading = tree.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'progressbar'
        && node.props.testID === 'skeleton-unit-settings',
    )
    const errors = nodes(tree, 'Text').filter(
      (node) => node.props.accessibilityLabel === 'calendar.fetchError',
    )

    expect(loading.length).toBeGreaterThan(0)
    expect(loading.every(
      (node) => node.props.accessibilityLabel === 'calendar.fetchingEvents',
    )).toBe(true)
    expect(errors).toHaveLength(0)
  })

  it('opens Calendars from the disconnected row even while offline', () => {
    const onReconnectCalendarEvents = vi.fn()
    const tree = renderDetail({ calendarEventsState: 'not-connected', onReconnectCalendarEvents })
    const row = nodes(tree, 'ListRowMock').find((row) => row.props.title === 'calendar.calendars.title')
    expect(row).toBeDefined()
    TestRenderer.act(() => (row?.props.onClick as () => void)())
    expect(onReconnectCalendarEvents).toHaveBeenCalledOnce()
    expect(nodes(tree, 'PillButtonMock')).toHaveLength(0)
  })

  it('keeps habits and one Pro badge row for a free account', () => {
    const onViewPro = vi.fn()
    const tree = renderDetail({ entries: [makeEntry()], calendarEventsState: 'pro-boundary', onViewPro })
    expect(nodes(tree, 'ListRowMock').some((row) => row.props.title === 'Meditate')).toBe(true)
    const row = nodes(tree, 'ListRowMock').find((row) => row.props.title === 'calendar.calendars.title')
    expect(row?.props.trailing).toBeDefined()
    TestRenderer.act(() => (row?.props.onClick as () => void)())
    expect(onViewPro).toHaveBeenCalledOnce()
    expect(nodes(tree, 'EventRowMock')).toHaveLength(0)
    expect(nodes(tree, 'SwitchMock')).toHaveLength(0)
  })

  it('renders the empty events state after an empty response resolves', () => {
    const tree = renderDetail({ entries: [makeEntry()], calendarEventsState: 'ready' })
    const empty = nodes(tree, 'Text').filter(
      (node) => node.props.children === 'No Google Calendar events on this day.',
    )
    const errors = nodes(tree, 'Text').filter(
      (node) => node.props.accessibilityLabel === 'calendar.fetchError',
    )

    expect(empty).toHaveLength(1)
    expect(errors).toHaveLength(0)
  })

  it('labels an unlogged ordinary row like a missed row', () => {
    const tree = renderDetail({
      entries: [
        makeEntry({ title: 'Read' }),
        makeEntry({ habitId: '2', title: 'Walk', status: 'missed' }),
        makeEntry({ habitId: '3', title: 'Swim', status: 'upcoming' }),
      ],
    })
    const rows = nodes(tree, 'ListRowMock')
    expect(rows.slice(0, 3).every((row) => row.props.compact === true)).toBe(true)
    expect(rows.slice(0, 3).map((row) => ({
      title: row.props.title,
      value: row.props.description,
      readOnly: row.props.readOnly,
      ringStatus: (row.props.trailing as React.ReactElement<{ status: string }>).props.status,
    }))).toEqual([
      { title: 'Read', value: '08:00', readOnly: true, ringStatus: 'done' },
      { title: 'Walk', value: '08:00', readOnly: true, ringStatus: 'empty' },
      { title: 'Swim', value: '08:00', readOnly: true, ringStatus: 'empty' },
    ])
  })

  it('labels an unlogged avoid-habit row like a resisted row', () => {
    const tree = renderDetail({
      entries: [
        makeEntry({ title: 'Sweets', isBadHabit: true }),
        makeEntry({ habitId: '2', title: 'Smoking', isBadHabit: true, status: 'missed' }),
        makeEntry({ habitId: '3', title: 'Beer', isBadHabit: true, status: 'upcoming' }),
      ],
    })
    const rows = nodes(tree, 'ListRowMock')
    expect(rows.slice(0, 3).map((row) => ({
      value: row.props.description,
      ringStatus: (row.props.trailing as React.ReactElement<{ status: string }>).props.status,
      ringLabel: (row.props.trailing as React.ReactElement<{ label: string }>).props.label,
    }))).toEqual([
      { value: '08:00', ringStatus: 'bad', ringLabel: 'indulged' },
      { value: '08:00', ringStatus: 'done', ringLabel: 'resisted' },
      { value: '08:00', ringStatus: 'empty', ringLabel: 'not logged' },
    ])
  })

  it('uses CheckRow on a loggable day and reports the requested state', () => {
    const entry = makeEntry({ title: 'Read' })
    const onEntryChange = vi.fn(async () => {})
    const tree = renderDetail({ entries: [entry], loggable: true, onEntryChange })
    const row = nodes(tree, 'CheckRowMock')[0]
    expect(row?.props).toMatchObject({ label: 'Read', checked: true, value: '08:00' })
    ;(row?.props.onChange as (checked: boolean) => void)(false)
    expect(onEntryChange).toHaveBeenCalledWith(entry, false)
  })

  it('keeps current-day unchecks upcoming before their writes settle', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-15T00:00:00Z'))
    const pendingChange = new Promise<void>(() => {})

    try {
      const tree = renderDetail({
        entries: [
          makeEntry({ title: 'Read' }),
          makeEntry({ habitId: '2', title: 'Sweets', isBadHabit: true }),
        ],
        loggable: true,
        onEntryChange: () => pendingChange,
      })

      TestRenderer.act(() => {
        for (const row of nodes(tree, 'CheckRowMock')) {
          ;(row.props.onChange as (checked: boolean) => void)(false)
        }
      })

      const values = nodes(tree, 'CheckRowMock').map((row) => row.props.value)
      expect(values).toEqual(['08:00', '08:00'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses a second request when source reconciliation lands mid-toggle', () => {
    const pendingChange = new Promise<void>(() => {})
    const entry = makeEntry({ title: 'Read', status: 'missed' })
    const onEntryChange = vi.fn(() => pendingChange)
    const tree = renderDetail({ entries: [entry], loggable: true, onEntryChange })

    TestRenderer.act(() => {
      const row = nodes(tree, 'CheckRowMock')[0]
      ;(row?.props.onChange as (checked: boolean) => void)(true)
    })
    TestRenderer.act(() => {
      tree.update(detailElement({
        entries: [{ ...entry, status: 'completed' }],
        loggable: true,
        onEntryChange,
      }))
    })
    TestRenderer.act(() => {
      const row = nodes(tree, 'CheckRowMock')[0]
      ;(row?.props.onChange as (checked: boolean) => void)(false)
    })

    expect(onEntryChange).toHaveBeenCalledTimes(1)
  })

  it('shows the next day server state without carrying over a pending toggle', () => {
    const pendingChange = new Promise<void>(() => {})
    const dayAEntry = makeEntry({ title: 'Read', status: 'missed' })
    const dayBEntry = makeEntry({ title: 'Read', status: 'missed' })
    const onEntryChange = vi.fn(() => pendingChange)
    const tree = renderDetail({ entries: [dayAEntry], loggable: true, onEntryChange })

    TestRenderer.act(() => {
      const row = nodes(tree, 'CheckRowMock')[0]
      ;(row?.props.onChange as (checked: boolean) => void)(true)
    })
    TestRenderer.act(() => {
      tree.update(detailElement({
        selectedDate: '2025-06-16',
        entries: [dayBEntry],
        loggable: true,
        onEntryChange,
      }))
    })

    const dayBRow = nodes(tree, 'CheckRowMock')[0]
    expect(dayBRow?.props).toMatchObject({ checked: false, loading: false })
    TestRenderer.act(() => {
      ;(dayBRow?.props.onChange as (checked: boolean) => void)(true)
    })
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
    const tree = renderDetail({ entries: [entry], loggable: true, onEntryChange })

    TestRenderer.act(() => {
      const row = nodes(tree, 'CheckRowMock')[0]
      ;(row?.props.onChange as (checked: boolean) => void)(true)
    })
    TestRenderer.act(() => {
      tree.update(detailElement({
        selectedDate: '2025-06-16',
        entries: [entry],
        loggable: true,
        onEntryChange,
      }))
    })
    TestRenderer.act(() => {
      tree.update(detailElement({ entries: [entry], loggable: true, onEntryChange }))
    })

    let returnedRow = nodes(tree, 'CheckRowMock')[0]
    expect(returnedRow?.props.loading).toBe(true)
    TestRenderer.act(() => {
      ;(returnedRow?.props.onChange as (checked: boolean) => void)(true)
    })
    expect(onEntryChange).toHaveBeenCalledTimes(1)

    await TestRenderer.act(async () => {
      resolveChange?.()
      await pendingChange
    })

    returnedRow = nodes(tree, 'CheckRowMock')[0]
    expect(returnedRow?.props.loading).toBe(true)
    TestRenderer.act(() => {
      ;(returnedRow?.props.onChange as (checked: boolean) => void)(true)
    })
    expect(onEntryChange).toHaveBeenCalledTimes(1)

    TestRenderer.act(() => {
      tree.update(detailElement({
        entries: [{ ...entry, status: 'completed' }],
        loggable: true,
        onEntryChange,
      }))
    })

    returnedRow = nodes(tree, 'CheckRowMock')[0]
    expect(returnedRow?.props.loading).toBe(false)
  })

  it('restores and enables a returned day when rejected source data changes identity', async () => {
    let rejectChange: ((reason?: unknown) => void) | undefined
    const pendingChange = new Promise<void>((_resolve, reject) => {
      rejectChange = reject
    })
    const entry = makeEntry({ title: 'Read', status: 'missed' })
    const onEntryChange = vi.fn(() => pendingChange)
    const tree = renderDetail({ entries: [entry], loggable: true, onEntryChange })

    TestRenderer.act(() => {
      const row = nodes(tree, 'CheckRowMock')[0]
      ;(row?.props.onChange as (checked: boolean) => void)(true)
    })
    TestRenderer.act(() => {
      tree.update(detailElement({
        selectedDate: '2025-06-16',
        entries: [entry],
        loggable: true,
        onEntryChange,
      }))
    })
    TestRenderer.act(() => {
      tree.update(detailElement({ entries: [entry], loggable: true, onEntryChange }))
    })

    await TestRenderer.act(async () => {
      rejectChange?.(new Error('write failed'))
      await pendingChange.catch(() => {})
    })

    let rejectedRow = nodes(tree, 'CheckRowMock')[0]
    expect(rejectedRow?.props).toMatchObject({ checked: false, loading: false })

    TestRenderer.act(() => {
      tree.update(detailElement({
        entries: [{ ...entry }],
        loggable: true,
        onEntryChange,
      }))
    })

    rejectedRow = nodes(tree, 'CheckRowMock')[0]
    expect(rejectedRow?.props.loading).toBe(false)
  })

  it('restores and enables a returned day after rejection with identical source data', async () => {
    let rejectChange: ((reason?: unknown) => void) | undefined
    const pendingChange = new Promise<void>((_resolve, reject) => {
      rejectChange = reject
    })
    const entry = makeEntry({ title: 'Read', status: 'missed' })
    const onEntryChange = vi.fn(() => pendingChange)
    const tree = renderDetail({ entries: [entry], loggable: true, onEntryChange })

    TestRenderer.act(() => {
      const row = nodes(tree, 'CheckRowMock')[0]
      ;(row?.props.onChange as (checked: boolean) => void)(true)
    })
    TestRenderer.act(() => {
      tree.update(detailElement({
        selectedDate: '2025-06-16',
        entries: [entry],
        loggable: true,
        onEntryChange,
      }))
    })
    TestRenderer.act(() => {
      tree.update(detailElement({ entries: [entry], loggable: true, onEntryChange }))
    })

    await TestRenderer.act(async () => {
      rejectChange?.(new Error('write failed'))
      await pendingChange.catch(() => {})
    })

    const rejectedRow = nodes(tree, 'CheckRowMock')[0]
    expect(rejectedRow?.props).toMatchObject({ checked: false, loading: false })
  })

  it('controls and serializes a row toggle, then rolls it back when the write fails', async () => {
    let rejectChange: ((reason?: unknown) => void) | undefined
    const pendingChange = new Promise<void>((_resolve, reject) => {
      rejectChange = reject
    })
    const entry = makeEntry({ title: 'Read', status: 'missed' })
    const onEntryChange = vi.fn(() => pendingChange)
    const tree = renderDetail({ entries: [entry], loggable: true, onEntryChange })

    TestRenderer.act(() => {
      const row = nodes(tree, 'CheckRowMock')[0]
      ;(row?.props.onChange as (checked: boolean) => void)(true)
    })

    let row = nodes(tree, 'CheckRowMock')[0]
    expect(row?.props).toMatchObject({
      checked: true,
      loading: true,
      value: '08:00',
    })
    TestRenderer.act(() => {
      ;(row?.props.onChange as (checked: boolean) => void)(false)
    })
    expect(onEntryChange).toHaveBeenCalledTimes(1)

    await TestRenderer.act(async () => {
      rejectChange?.(new Error('write failed'))
      await pendingChange.catch(() => {})
    })

    row = nodes(tree, 'CheckRowMock')[0]
    expect(row?.props).toMatchObject({
      checked: false,
      loading: false,
      value: '08:00',
    })

    TestRenderer.act(() => {
      tree.update(detailElement({
        entries: [{ ...entry }],
        loggable: true,
        onEntryChange,
      }))
    })

    row = nodes(tree, 'CheckRowMock')[0]
    expect(row?.props.loading).toBe(false)
  })

  it('routes the panel row through the supplied Today callback', () => {
    const onGoToDay = vi.fn()
    const tree = renderDetail({ onGoToDay })
    const routeRow = nodes(tree, 'ListRowMock').at(-1)
    expect(routeRow?.props).toMatchObject({
      title: 'Open this day on Today',
      textMode: 'label',
      icon: 'external-link',
      chevron: false,
      onClick: onGoToDay,
    })
  })









  it('searches a busy day only after opening its events sheet', () => {
    const calendarEvents: CalendarSyncEvent[] = Array.from({ length: 21 }, (_, index) => ({ id: `event-${index}`, title: `Event ${index}`, description: null, startDate: '2025-06-15', startTime: '09:00', endTime: null, isRecurring: false, recurrenceRule: null, reminders: [] }))
    const tree = renderDetail({ calendarEvents })
    expect(nodes(tree, 'InputMock')).toHaveLength(0)
    const all = nodes(tree, 'ListRowMock').find((row) => row.props.title === 'calendar.dayDetail.viewAllEvents')
    TestRenderer.act(() => (all?.props.onClick as () => void)())
    const search = nodes(tree, 'InputMock')[0]
    expect(search?.props.label).toBe('calendar.dayDetail.searchEvents')
    TestRenderer.act(() => (search?.props.onChange as (value: string) => void)('Event 20'))
    expect(nodes(tree, 'EventRowMock').filter((row) => row.props.title === 'Event 20')).toHaveLength(1)
    TestRenderer.act(() => (search?.props.onChange as (value: string) => void)('No such event'))
    expect(nodes(tree, 'Text').some((row) => String(row.props.children).startsWith('calendar.dayDetail.noMatchingEvents'))).toBe(true)
  })
})


describe('CalendarDayDetail mixed-type family carry', () => {
  const loggedDate = '2026-09-28'
  function badParentWithGoodChildLog(): CalendarMonthResponse {
    return {
      habits: [
        createMockHabitScheduleItem({
          id: "bad-parent",
          title: "Bad parent",
          isBadHabit: true,
          frequencyUnit: "Week",
          dueDate: "2026-09-29",
          scheduledDates: ["2026-09-29"],
          instances: [{ date: "2026-09-29", status: "Pending", logId: null }],
          children: [
            createMockHabitScheduleChild({
              id: "good-child",
              title: "Good child",
              frequencyUnit: "Week",
              frequencyQuantity: 3,
              dueDate: "2026-10-19",
              scheduledDates: [loggedDate],
              isLoggedInRange: true,
              instances: [{ date: loggedDate, status: "Completed", logId: "good-child-log" }],
            }),
          ],
          hasSubHabits: true,
        }),
      ],
      logs: { "bad-parent": [] },
    };
  }

  it('labels a good sub-habit log under a bad parent as completed, not as a slip', () => {
    const dayMap = buildCalendarDayMap(badParentWithGoodChildLog(),
      { from: '2026-09-01', to: '2026-09-30' }, new Date('2026-09-29T12:00:00'))
    const tree = renderDetail({ selectedDate: loggedDate, entries: dayMap.get(loggedDate) ?? [] })
    const rows = nodes(tree, 'ListRowMock').filter((row) => row.props.readOnly === true)
    expect(rows.map((row) => row.props.title)).toEqual(['Good child'])
    const ring = rows[0]?.props.trailing as React.ReactElement<{ status: string; label: string }>
    expect(ring.props.status).toBe('done')
    expect(ring.props.label).toBe(en.calendar.status.completed)
    expect(ring.props.label).not.toBe(en.calendar.status.indulged)
  })
})


describe('day card disclosure regression', () => {
  it.each([8, 21])('limits %i events to three tappable preview rows without sync controls', (count) => {
    const onOpenCalendarImport = vi.fn()
    const tree = renderDetail({ onOpenCalendarImport, calendarEvents: Array.from({ length: count }, (_, index) => ({
      id: `preview-${index}`, title: `Preview ${index}`, description: null,
      startDate: '2025-06-15', startTime: '09:00', endTime: null,
      isRecurring: false, recurrenceRule: null, reminders: [],
    })) })
    expect(nodes(tree, 'EventRowMock')).toHaveLength(3)
    expect(nodes(tree, 'SwitchMock')).toHaveLength(0)
    expect(nodes(tree, 'PillButtonMock')).toHaveLength(0)
    TestRenderer.act(() => (nodes(tree, 'EventRowMock')[0]?.props.onClick as () => void)())
    expect(onOpenCalendarImport).toHaveBeenCalledWith('preview-0')
    expect(nodes(tree, 'ListRowMock').some((row) => row.props.title === 'calendar.dayDetail.viewAllEvents')).toBe(true)
  })
})
