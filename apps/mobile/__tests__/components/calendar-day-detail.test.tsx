import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { TFunction } from 'i18next'
import type { CalendarAutoSyncState, CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { CalendarSyncEvent } from '@orbit/shared'
import type { CalendarEventsDisplayState } from '@orbit/shared/utils'
import {
  getCalendarEntryMutationKey,
  useCalendarEntryMutationLock,
} from '@orbit/shared/hooks'
import { createTokensV2 } from '@/lib/theme'
import { CalendarDayDetail } from '@/app/(tabs)/calendar/_components/calendar-day-detail'

const TestRenderer = require('react-test-renderer')

vi.mock('@/components/ui/list-row', () => ({
  ListRow: (props: Record<string, unknown>) => React.createElement('ListRowMock', props),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('PillButtonMock', props, children),
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

type TestNode = {
  type: unknown
  props: Record<string, unknown>
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
  'calendar.goToDay': 'Open this day on Today',
  'calendar.status.completed': 'done',
  'calendar.status.missed': 'not logged',
  'calendar.status.indulged': 'indulged',
  'calendar.status.resisted': 'resisted',
  'calendar.status.upcoming': 'Upcoming',
  'calendar.autoSync.reconnectTitle': 'Google Calendar disconnected',
  'calendar.autoSync.reconnectBody': 'Auto-sync paused. Reconnect to resume.',
  'calendar.autoSync.reconnectCta': 'Reconnect',
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
  hasProAccess?: boolean
  autoSyncState?: CalendarAutoSyncState
  calendarEventsState?: CalendarEventsDisplayState
  onRetryCalendarEvents?: () => void
  onReconnectCalendarEvents?: () => void
  loggable?: boolean
  onCalendarAutoSyncChange?: (value: boolean) => Promise<void>
  onOpenPro?: () => void
  onEntryChange?: (entry: CalendarDayEntry, checked: boolean) => Promise<void>
  onGoToDay?: () => void
}

function CalendarDayDetailHarness({
  selectedDate = '2025-06-15',
  entries = [],
  calendarEvents = [],
  hasProAccess = true,
  autoSyncState = proAutoSyncState,
  calendarEventsState = 'hidden',
  onRetryCalendarEvents = () => {},
  onReconnectCalendarEvents = () => {},
  loggable = false,
  onCalendarAutoSyncChange = async () => {},
  onOpenPro = () => {},
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
      selectedEntries={entries}
      filteredEntries={entries}
      calendarEvents={calendarEvents}
      hasProAccess={hasProAccess}
      autoSyncState={autoSyncState}
      calendarEventsState={calendarEventsState}
      onRetryCalendarEvents={onRetryCalendarEvents}
      onReconnectCalendarEvents={onReconnectCalendarEvents}
      completedCount={entries.filter((entry) => entry.status === 'completed').length}
      loggable={loggable}
      showRecurring
      pendingEntryStates={pendingEntryStates}
      onShowRecurringChange={() => {}}
      onCalendarAutoSyncChange={onCalendarAutoSyncChange}
      onOpenPro={onOpenPro}
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
      paddingVertical: 16,
    })
  })

  it('renders timed and all-day Google events through the read-only event row', () => {
    const tree = renderDetail({
      entries: [makeEntry()],
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

    expect(nodes(tree, 'EventRowMock').map((event) => event.props)).toEqual([
      expect.objectContaining({
        time: '09:00',
        title: 'Team meeting',
        source: 'calendar.title',
      }),
      expect.objectContaining({
        allDayLabel: 'calendar.timeGrid.allDay',
        title: 'Company holiday',
        source: 'calendar.title',
      }),
    ])
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

  it('offers reconnection without rendering the connected-empty treatment', () => {
    const onReconnectCalendarEvents = vi.fn()
    const tree = renderDetail({
      entries: [makeEntry()],
      calendarEventsState: 'not-connected',
      onReconnectCalendarEvents,
    })
    const text = nodes(tree, 'Text').map((node) => node.props.children)
    const reconnectButton = nodes(tree, 'PillButtonMock')[0]

    expect(text).toContain('Google Calendar disconnected')
    expect(text).toContain('Auto-sync paused. Reconnect to resume.')
    expect(text).not.toContain('calendar.noEvents')
    const onClick = reconnectButton?.props.onClick
    expect(typeof onClick).toBe('function')
    if (typeof onClick === 'function') TestRenderer.act(() => onClick())
    expect(onReconnectCalendarEvents).toHaveBeenCalledTimes(1)
  })

  it('renders the empty events state after an empty response resolves', () => {
    const tree = renderDetail({ entries: [makeEntry()], calendarEventsState: 'ready' })
    const empty = nodes(tree, 'Text').filter(
      (node) => node.props.children === 'calendar.noEvents',
    )
    const errors = nodes(tree, 'Text').filter(
      (node) => node.props.accessibilityLabel === 'calendar.fetchError',
    )

    expect(empty).toHaveLength(1)
    expect(errors).toHaveLength(0)
  })

  it('keeps ordinary upcoming rows distinct from completed and missed outcomes', () => {
    const tree = renderDetail({
      entries: [
        makeEntry({ title: 'Read' }),
        makeEntry({ habitId: '2', title: 'Walk', status: 'missed' }),
        makeEntry({ habitId: '3', title: 'Swim', status: 'upcoming' }),
      ],
    })
    const rows = nodes(tree, 'ListRowMock')
    expect(rows.slice(0, 3).map((row) => ({
      title: row.props.title,
      value: row.props.value,
      readOnly: row.props.readOnly,
      ringStatus: (row.props.trailing as React.ReactElement<{ status: string }>).props.status,
    }))).toEqual([
      { title: 'Read', value: '08:00 · done', readOnly: true, ringStatus: 'done' },
      { title: 'Walk', value: '08:00 · not logged', readOnly: true, ringStatus: 'empty' },
      { title: 'Swim', value: '08:00 · Upcoming', readOnly: true, ringStatus: 'empty' },
    ])
  })

  it('keeps avoid-habit upcoming rows distinct from indulged and resisted outcomes', () => {
    const tree = renderDetail({
      entries: [
        makeEntry({ title: 'Sweets', isBadHabit: true }),
        makeEntry({ habitId: '2', title: 'Smoking', isBadHabit: true, status: 'missed' }),
        makeEntry({ habitId: '3', title: 'Beer', isBadHabit: true, status: 'upcoming' }),
      ],
    })
    const rows = nodes(tree, 'ListRowMock')
    expect(rows.slice(0, 3).map((row) => ({
      value: row.props.value,
      ringStatus: (row.props.trailing as React.ReactElement<{ status: string }>).props.status,
    }))).toEqual([
      { value: '08:00 · indulged', ringStatus: 'bad' },
      { value: '08:00 · resisted', ringStatus: 'done' },
      { value: '08:00 · Upcoming', ringStatus: 'empty' },
    ])
  })

  it('uses CheckRow on a loggable day and reports the requested state', () => {
    const entry = makeEntry({ title: 'Read' })
    const onEntryChange = vi.fn(async () => {})
    const tree = renderDetail({ entries: [entry], loggable: true, onEntryChange })
    const row = nodes(tree, 'CheckRowMock')[0]
    expect(row?.props).toMatchObject({ label: 'Read', checked: true, value: '08:00 · done' })
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
      expect(values).toEqual(['08:00 · Upcoming', '08:00 · Upcoming'])
      expect(values).not.toContain('08:00 · not logged')
      expect(values).not.toContain('08:00 · resisted')
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
      value: '08:00 · done',
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
      value: '08:00 · not logged',
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
      icon: 'external-link',
      chevron: false,
      onClick: onGoToDay,
    })
  })

  it('keeps habits visible while replacing events with the free plan boundary', () => {
    const onOpenPro = vi.fn()
    const tree = renderDetail({
      entries: [makeEntry({ title: 'Read' })],
      calendarEvents: [{
        id: 'event-1', title: 'Team meeting', description: null,
        startDate: '2025-06-15', startTime: '09:00', endTime: null,
        isRecurring: false, recurrenceRule: null, reminders: [],
      }],
      hasProAccess: false,
      onOpenPro,
    })

    expect(nodes(tree, 'ListRowMock').map((row) => row.props.title)).toContain('Read')
    expect(nodes(tree, 'EventRowMock')).toHaveLength(0)
    expect(nodes(tree, 'CapacityNoticeMock')).toHaveLength(1)
    const action = nodes(tree, 'PillButtonMock')[0]
    expect(action?.props.variant).toBe('primary')
    TestRenderer.act(() => (action?.props.onClick as () => void)())
    expect(onOpenPro).toHaveBeenCalledOnce()
  })

  it('builds the Pro sync line and switch from the profile fields', () => {
    const onCalendarAutoSyncChange = vi.fn(async () => {})
    const tree = renderDetail({
      entries: [makeEntry()],
      autoSyncState: proAutoSyncState,
      onCalendarAutoSyncChange,
    })

    const text = nodes(tree, 'Text').map((node) => node.props.children)
    expect(text).toContain('calendar.dayDetail.googleConnected')
    const autoSync = nodes(tree, 'SwitchMock')[0]
    expect(autoSync?.props.accessibilityState).toEqual({ checked: true })
    TestRenderer.act(() => (autoSync?.props.onPress as () => void)())
    expect(onCalendarAutoSyncChange).toHaveBeenCalledWith(false)
  })

  it('does not offer auto-sync as enabled without a Google connection', () => {
    const tree = renderDetail({
      entries: [makeEntry()],
      autoSyncState: { ...proAutoSyncState, hasGoogleConnection: false },
    })

    expect(nodes(tree, 'SwitchMock')).toHaveLength(0)
  })
})
