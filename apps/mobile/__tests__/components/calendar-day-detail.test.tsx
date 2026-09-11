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
}

const translations: Record<string, string> = {
  'calendar.dayDetail.nothingDue': 'nothing due',
  'calendar.noHabitsScheduled': 'No habit was scheduled on this day.',
  'calendar.goToDay': 'Open this day on Today',
  'calendar.status.completed': 'done',
  'calendar.status.missed': 'not logged',
  'calendar.status.indulged': 'indulged',
  'calendar.status.resisted': 'resisted',
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

function renderDetail({
  entries = [],
  loggable = false,
  onEntryChange = () => {},
  onGoToDay = () => {},
}: {
  entries?: CalendarDayEntry[]
  loggable?: boolean
  onEntryChange?: (entry: CalendarDayEntry, checked: boolean) => void
  onGoToDay?: () => void
} = {}): Tree {
  const tokens = createTokensV2('purple', 'dark')
  let tree: Tree
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <CalendarDayDetail
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
      />,
    )
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
      padding: 16,
    })
  })

  it('puts read-only outcomes in ListRow values and rings in the trailing slot', () => {
    const tree = renderDetail({
      entries: [
        makeEntry({ title: 'Read' }),
        makeEntry({ habitId: '2', title: 'Walk', status: 'missed' }),
      ],
    })
    const rows = nodes(tree, 'ListRowMock')
    expect(rows.slice(0, 2).map((row) => ({
      title: row.props.title,
      value: row.props.value,
      readOnly: row.props.readOnly,
      ringStatus: (row.props.trailing as React.ReactElement<{ status: string }>).props.status,
    }))).toEqual([
      { title: 'Read', value: '08:00 · done', readOnly: true, ringStatus: 'done' },
      { title: 'Walk', value: '08:00 · not logged', readOnly: true, ringStatus: 'empty' },
    ])
  })

  it('uses avoid-habit vocabulary and ring meaning for completed and unlogged rows', () => {
    const tree = renderDetail({
      entries: [
        makeEntry({ title: 'Sweets', isBadHabit: true }),
        makeEntry({ habitId: '2', title: 'Smoking', isBadHabit: true, status: 'upcoming' }),
      ],
    })
    const rows = nodes(tree, 'ListRowMock')
    expect(rows.slice(0, 2).map((row) => ({
      value: row.props.value,
      ringStatus: (row.props.trailing as React.ReactElement<{ status: string }>).props.status,
    }))).toEqual([
      { value: '08:00 · indulged', ringStatus: 'bad' },
      { value: '08:00 · resisted', ringStatus: 'done' },
    ])
  })

  it('uses CheckRow on a loggable day and reports the requested state', () => {
    const entry = makeEntry({ title: 'Read' })
    const onEntryChange = vi.fn()
    const tree = renderDetail({ entries: [entry], loggable: true, onEntryChange })
    const row = nodes(tree, 'CheckRowMock')[0]
    expect(row?.props).toMatchObject({ label: 'Read', checked: true, value: '08:00 · done' })
    ;(row?.props.onChange as (checked: boolean) => void)(false)
    expect(onEntryChange).toHaveBeenCalledWith(entry, false)
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
