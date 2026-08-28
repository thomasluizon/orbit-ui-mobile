import React from 'react'
import { Text } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import type { DayCellWords } from '@orbit/shared/contracts/dates'
import { DayCell } from '@/components/dates/day-cell'
import { DayStrip } from '@/components/dates/day-strip'
import { EventRow } from '@/components/dates/event-row'
import { MonthGrid } from '@/components/dates/month-grid'

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  children: (TestNode | string)[]
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
}

interface TestTree {
  root: {
    findByProps(props: Record<string, unknown>): TestNode
    findAllByProps(props: Record<string, unknown>): TestNode[]
    findAll(predicate: (node: TestNode) => boolean): TestNode[]
  }
  toJSON(): unknown
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
}

const TestRenderer: TestRendererApi = require('react-test-renderer')
const cellWords: DayCellWords = {
  none: 'none',
  partial: 'partial',
  full: 'full',
  notScheduled: 'not scheduled',
  future: 'upcoming',
  of: 'of',
  today: 'today',
  selected: 'selected',
  readOnly: 'read only',
}

function render(element: React.ReactNode): TestTree {
  let tree!: TestTree
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

describe('DayStrip', () => {
  it('renders habit entries in order with caller words and the strip label', () => {
    const tree = render(
      <DayStrip
        scope="habit"
        days={['done', 'missed', 'not-scheduled']}
        labels={['Mon 1', 'Tue 2', 'Wed 3']}
        words={{ done: 'complete', missed: 'missed', notScheduled: 'rest' }}
        label="Habit history"
      />,
    )
    const strip = tree.root.findByProps({ testID: 'day-strip-habit' })
    expect(strip.props.accessibilityLabel).toBe('Habit history')
    expect(tree.root.findByProps({ accessibilityLabel: 'Mon 1, complete' })).toBeTruthy()
    expect(tree.root.findByProps({ accessibilityLabel: 'Wed 3, rest' })).toBeTruthy()
    expect(tree.root.findByProps({ testID: 'day-strip-cell-done' })).toBeTruthy()
    expect(tree.root.findByProps({ testID: 'day-strip-cell-missed' })).toBeTruthy()
    expect(tree.root.findByProps({ testID: 'day-strip-cell-not-scheduled' })).toBeTruthy()
  })

  it('marks only the account today entry as current', () => {
    const tree = render(
      <DayStrip
        scope="account"
        days={['active', 'frozen', 'missed', 'today']}
        words={{ active: 'active', frozen: 'protected', missed: 'missed', today: 'today' }}
        label="Account streak"
      />,
    )
    const today = tree.root.findByProps({ testID: 'day-strip-cell-today' })
    expect(today.props.accessibilityState).toEqual({ selected: true })
    expect(tree.root.findByProps({ testID: 'day-strip-cell-active' }).props.accessibilityState).toEqual({ selected: false })
  })
})

describe('DayCell', () => {
  it('renders a loggable button and presses once', () => {
    const onPress = vi.fn()
    const tree = render(<DayCell day={12} label="March 12" loggable words={cellWords} scheduled={4} done={1} onPress={onPress} />)
    const cell = tree.root.findByProps({ testID: 'day-cell-partial' })
    expect(cell.props.accessibilityRole).toBe('button')
    expect(cell.props.accessibilityLabel).toBe('March 12, partial 1 of 4')
    TestRenderer.act(() => {
      ;(cell.props.onPress as () => void)()
    })
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('renders read-only, selected, outside, and derived outcomes on the cell', () => {
    const future = render(<DayCell day={13} label="March 13" words={cellWords} outcome="future" selected />)
    const futureCell = future.root.findByProps({ testID: 'day-cell-future' })
    expect(futureCell.props.accessibilityRole).toBe('image')
    expect(futureCell.props.accessibilityLabel).toBe('March 13, upcoming, selected, read only')

    const unscheduled = render(<DayCell day={14} label="March 14" words={cellWords} scheduled={0} />)
    expect(unscheduled.root.findByProps({ testID: 'day-cell-not-scheduled' }).props.accessibilityLabel).toBe(
      'March 14, not scheduled, read only',
    )

    const outside = render(<DayCell day={30} label="April 30" words={cellWords} outsideMonth />)
    const outsideCell = outside.root.findByProps({ testID: 'day-cell-none-outside-month' })
    expect(outsideCell.props.accessibilityElementsHidden).toBe(true)
    expect(outsideCell.props.onPress).toBeUndefined()
  })

  it('draws the partial arc from the exact completion fraction', () => {
    const quarter = render(<DayCell day={15} label="March 15" words={cellWords} scheduled={4} done={1} />)
    const quarterArc = quarter.root.findAll(
      (node) => node.type === 'Circle' && Array.isArray(node.props.strokeDasharray),
    )[0]
    expect(quarterArc?.props.strokeDasharray).toEqual([Math.PI * 42 * 0.25, Math.PI * 42])

    const threeQuarters = render(<DayCell day={15} label="March 15" words={cellWords} scheduled={4} done={3} />)
    const threeQuarterArc = threeQuarters.root.findAll(
      (node) => node.type === 'Circle' && Array.isArray(node.props.strokeDasharray),
    )[0]
    expect(threeQuarterArc?.props.strokeDasharray).toEqual([Math.PI * 42 * 0.75, Math.PI * 42])
  })
})

describe('MonthGrid', () => {
  it('takes its column count from labels and keeps child order', () => {
    const five = render(
      <MonthGrid weekdayLabels={['M', 'T', 'W', 'T', 'F']} label="Work week">
        <Text>one</Text><Text>two</Text>
      </MonthGrid>,
    )
    expect(five.root.findByProps({ testID: 'month-grid-5-columns' }).props.accessibilityLabel).toBe('Work week')
    const serialized = JSON.stringify(five.toJSON())
    expect(serialized.indexOf('one')).toBeLessThan(serialized.indexOf('two'))

    const seven = render(<MonthGrid weekdayLabels={['S', 'M', 'T', 'W', 'T', 'F', 'S']}><Text>day</Text></MonthGrid>)
    expect(seven.root.findByProps({ testID: 'month-grid-7-columns' })).toBeTruthy()
  })

  it('omits the header for an empty label list and keeps children', () => {
    const tree = render(<MonthGrid weekdayLabels={[]}><Text>day</Text></MonthGrid>)
    expect(tree.root.findAllByProps({ testID: 'month-grid-header' })).toHaveLength(0)
    expect(tree.root.findByProps({ testID: 'month-grid-days' }).children).toHaveLength(1)
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'day')).toHaveLength(1)
  })

  it('uses the same gap on both axes and keeps seven slots in one row', () => {
    const tree = render(
      <MonthGrid weekdayLabels={['S', 'M', 'T', 'W', 'T', 'F', 'S']} gap={0}>
        {Array.from({ length: 7 }, (_, day) => <Text key={day}>{day + 1}</Text>)}
      </MonthGrid>,
    )
    const headerStyle = tree.root.findByProps({ testID: 'month-grid-header' }).props.style
    const daysStyle = tree.root.findByProps({ testID: 'month-grid-days' }).props.style
    const row = tree.root.findByProps({ testID: 'month-grid-row-0' })
    expect(headerStyle).toEqual(expect.arrayContaining([expect.objectContaining({ columnGap: 0, marginBottom: 0 })]))
    expect(daysStyle).toEqual(expect.objectContaining({ rowGap: 0 }))
    expect(row.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ columnGap: 0 })]))
    const slots = row.findAll(
      (node) => node.type === 'View' && (node.props.style as { flex?: number }).flex === 1,
    )
    expect(slots).toHaveLength(7)
    expect(7 * 44).toBeLessThanOrEqual(320 - 8)
  })
})

describe('EventRow', () => {
  it('renders timed and all-day events without controls', () => {
    const timed = render(<EventRow time="09:00" title="Standup" source="Work" />)
    const timedRow = timed.root.findByProps({ testID: 'event-row-timed' })
    expect(timedRow.props.accessibilityLabel).toBe('09:00, Standup, Work')
    expect(timed.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0)

    const allDay = render(<EventRow allDayLabel="All day" title="Holiday" source="Personal" />)
    expect(allDay.root.findByProps({ testID: 'event-row-all-day' }).props.accessibilityLabel).toBe(
      'All day, Holiday, Personal',
    )
    expect(allDay.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0)
  })
})
