import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { TFunction } from 'i18next'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { createTokensV2 } from '@/lib/theme'
import { CalendarDayDetail } from '@/app/(tabs)/calendar/_components/calendar-day-detail'

const TestRenderer = require('react-test-renderer')

vi.mock('@/components/ui/list-row', () => ({
  ListRow: (props: Record<string, unknown>) => React.createElement('ListRowMock', props),
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
}

const translate = ((key: string, params?: Record<string, unknown>) => {
  if (key === 'calendar.dayDetail.completionSummary') {
    return `${String(params?.done)} of ${String(params?.total)} logged`
  }
  return translations[key] ?? key
}) as unknown as TFunction

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
  loggable?: boolean
  onEntryChange?: (entry: CalendarDayEntry, checked: boolean) => Promise<void>
  onGoToDay?: () => void
}

function detailElement({
  selectedDate = '2025-06-15',
  entries = [],
  loggable = false,
  onEntryChange = async () => {},
  onGoToDay = () => {},
}: RenderDetailProps = {}): React.ReactElement {
  const tokens = createTokensV2('purple', 'dark')
  return (
    <CalendarDayDetail
      selectedDate={selectedDate}
      selectedEntries={entries}
      filteredEntries={entries}
      completedCount={entries.filter((entry) => entry.status === 'completed').length}
      loggable={loggable}
      showRecurring
      onShowRecurringChange={() => {}}
      onEntryChange={onEntryChange}
      onGoToDay={onGoToDay}
      displayTime={(time) => time}
      t={translate}
      tokens={tokens}
    />
  )
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
})
