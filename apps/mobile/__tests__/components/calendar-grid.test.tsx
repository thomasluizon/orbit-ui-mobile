import React, { type ComponentProps } from 'react'
import { StyleSheet } from 'react-native'
import * as ReactNative from 'react-native'
import { measureGrid, type GeometryHost } from '@/__tests__/support/calendar-grid-geometry'
import type { StyleProp, ViewStyle } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCalendarMonthModel, buildCalendarRangeModel, type CalendarMonthDay } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { CalendarGrid as CalendarGridComponent } from '@/app/(tabs)/calendar/_components/calendar-grid'
import { CalendarRangeView } from '@/app/(tabs)/calendar/_components/calendar-range-view'
import { i18n } from '@/lib/i18n'
import { useCurrentDate } from '@/app/(tabs)/use-today-date'

const todaySource = vi.hoisted(() => ({ value: '2026-09-11' }))

vi.mock('@/app/(tabs)/use-today-date', () => ({
  useCurrentDate: () => todaySource.value,
}))

interface TestNode {
  findAll(predicate: (node: TestNode) => boolean): TestNode[]
  type: unknown
  props: Record<string, unknown> & { children?: unknown; style?: StyleProp<ViewStyle> }
}

interface TestTree {
  toJSON(): GeometryHost
  update(element: React.ReactNode): void
  root: {
    findByProps(props: Record<string, unknown>): TestNode
    findAll(predicate: (node: TestNode) => boolean): TestNode[]
  }
}

interface TestRendererApi {
  create(element: React.ReactNode): TestTree
  act(callback: () => void): void
}

const TestRenderer: TestRendererApi = require('react-test-renderer')

function CalendarGrid(props: Omit<ComponentProps<typeof CalendarGridComponent>, 'todayKey'>) {
  return <CalendarGridComponent {...props} todayKey={useCurrentDate()} />
}

function gridDay(dateStr: string, completedCount = 0, totalCount = 1): CalendarMonthDay {
  const date = new Date(`${dateStr}T12:00:00`)
  return {
    date,
    dateStr,
    day: date.getDate(),
    isCurrentMonth: true,
    isToday: dateStr === '2026-09-11',
    entries: [],
    completedCount,
    totalCount,
    completionRatio: totalCount > 0 ? completedCount / totalCount : 0,
  }
}

describe('CalendarGrid (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T12:00:00'))
    todaySource.value = '2026-09-11'
  })

  afterEach(() => vi.useRealTimers())

  it.each([320, 339, 340, 360, 363, 363.5, 364, 365, 412, 600, 840, 1100, 1352].flatMap((width) => [false, true].flatMap((isLoading) =>
    (['month', 'range'] as const).map((view) => ({ width, isLoading, view })),
  )))('fills the $view content column at $width (loading=$isLoading)', ({ width, isLoading, view }) => {
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 915, scale: 1, fontScale: 1 })
    const tokens = createTokensV2('purple', 'dark')
    const month = buildCalendarMonthModel(new Date(2026, 8, 1), new Map(), 1, '2026-09-11')
    const range = buildCalendarRangeModel(new Date(2026, 8, 11), new Map(), 1, '2026-09-11')
    const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    let tree!: TestTree
    try {
      TestRenderer.act(() => {
        tree = TestRenderer.create(view === 'month'
          ? <CalendarGrid gridDays={month.gridDays} weekdayHeaders={weekdayLabels.map((label, index) => ({ key: String(index), label }))}
              selectedDay={null} isLoading={isLoading} onSelectDay={vi.fn()} language="en" t={(key) => key} tokens={tokens} />
          : <CalendarRangeView model={range} weekdayLabels={weekdayLabels} rangeLabel="Range"
              isLoading={isLoading} loadingLabel="Loading"
              stats={[{ key: 'bestStreak', value: range.stats.bestStreak, label: 'Streak' }, { key: 'totalLogs', value: range.stats.totalLogs, label: 'Logs' }, { key: 'missed', value: range.stats.missed, label: 'Missed' }]}
              language="en" t={i18n.t} />)
      })
      const geometry = measureGrid(tree.toJSON(), width, view, isLoading)
      const expectedGap = width < 364 ? 0 : 4
      expect(geometry.columnGap).toBeCloseTo(expectedGap, 4)
      expect(geometry.slots).toHaveLength(7)
      for (const slot of geometry.slots) {
        expect(slot.width).toBeCloseTo((width - 32 - 6 * expectedGap) / 7, 4)
        expect(slot.height).toBeGreaterThanOrEqual(44)
      }
      expect(geometry.inlineInset).toBe(16)
      expect(geometry.frameWidth).toBe(width)
      expect(geometry.cardWidth).toBe(geometry.contentWidth)
      if (isLoading && view === 'month') expect(geometry.loadingRowWidth).toBe(geometry.contentWidth)
      for (const placeholder of geometry.placeholders) {
        expect(Math.abs(placeholder.center - placeholder.columnCenter)).toBeLessThanOrEqual(0.5)
        expect(placeholder.width).toBeLessThanOrEqual(placeholder.columnWidth + 0.5)
      }
      for (const disc of geometry.discs) {
        expect(disc.width).toBeLessThanOrEqual(disc.columnWidth + 0.5)
        expect(disc.width).toBeCloseTo(disc.height, 1)
      }
      expect(geometry.targets).toHaveLength(isLoading ? 0 : view === 'month' ? 30 : 14)
      for (const target of geometry.targets) {
        expect(target.width).toBeCloseTo(target.columnWidth, 1)
        expect(target.height).toBeGreaterThanOrEqual(44)
      }
    } finally { dimensions.mockRestore() }
  })

  it('does not reserve a sixth row for a five-week month', () => {
    const { gridDays } = buildCalendarMonthModel(new Date(2026, 8, 1), new Map(), 1, '2026-09-11')
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarGrid gridDays={gridDays}
        weekdayHeaders={Array.from({ length: 7 }, (_, index) => ({ key: String(index), label: String(index) }))}
        selectedDay={null} onSelectDay={vi.fn()} language="en" t={(key) => key} tokens={createTokensV2('purple', 'dark')} />)
    })
    expect(tree.root.findAll((node) => typeof node.type === 'string' && String(node.props.testID).startsWith('month-grid-row-'))).toHaveLength(5)
    expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'month-grid-days' }).props.style).minHeight).toBeUndefined()
  })

  it('uses the grid skeleton geometry and withholds weekdays while loading', () => {
    const tokens = createTokensV2('purple', 'dark')
    const days = Array.from({ length: 42 }, (_, index) =>
      gridDay(`2026-09-${String((index % 28) + 1).padStart(2, '0')}`),
    )
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarGrid
          gridDays={days}
          weekdayHeaders={[
            { key: 'sun', label: 'S' },
            { key: 'mon', label: 'M' },
            { key: 'tue', label: 'T' },
            { key: 'wed', label: 'W' },
            { key: 'thu', label: 'T' },
            { key: 'fri', label: 'F' },
            { key: 'sat', label: 'S' },
          ]}
          selectedDay={null}
          isLoading
          onSelectDay={vi.fn()}
          language="en"
          t={(key) => key}
          tokens={tokens}
        />,
      )
    })

    const shapes = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'skeleton-grid-shape')
    expect(shapes).toHaveLength(days.length)
    for (const shape of shapes) expect(StyleSheet.flatten(shape.props.style)).toMatchObject({ width: 44, height: 44, gap: 0 })
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'progressbar')).toHaveLength(1)
    expect(tree.root.findAll((node) => node.props.testID === 'month-grid-header')).toHaveLength(0)
    expect(tree.root.findAll((node) => node.props.testID === 'calendar-day-skeleton')).toHaveLength(0)
  })

  it('keeps the slot transparent and delegates selected presentation to DayCell', () => {
    const tokens = createTokensV2('purple', 'dark')
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarGrid
          gridDays={[gridDay('2026-09-10'), gridDay('2026-09-12')]}
          weekdayHeaders={[
            { key: 'sun', label: 'S' },
            { key: 'mon', label: 'M' },
            { key: 'tue', label: 'T' },
            { key: 'wed', label: 'W' },
            { key: 'thu', label: 'T' },
            { key: 'fri', label: 'F' },
            { key: 'sat', label: 'S' },
          ]}
          selectedDay="2026-09-10"
          isLoading={false}
          onSelectDay={vi.fn()}
          language="en"
          t={(key) => key}
          tokens={tokens}
        />,
      )
    })

    const gridWrapper = StyleSheet.flatten(tree.root.findByProps({ testID: 'calendar-grid-card' }).props.style)
    expect(gridWrapper).not.toHaveProperty('backgroundColor')
    expect(gridWrapper).not.toHaveProperty('borderWidth')
    expect(gridWrapper).not.toHaveProperty('borderRadius')
    const futureNumeral = tree.root.findByProps({ testID: 'day-future-numeral' })
    expect(StyleSheet.flatten(futureNumeral.props.style)).toMatchObject({ color: tokens.fg2 })
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 12)).toHaveLength(1)
    const futureSlot = tree.root.findByProps({ testID: 'calendar-day-slot-2026-09-12' })
    expect(StyleSheet.flatten(futureSlot.props.style)).toMatchObject({
      alignItems: 'center',
      justifyContent: 'center',
    })
    const selectedSlot = tree.root.findByProps({ testID: 'calendar-day-slot-2026-09-10' })
    expect(StyleSheet.flatten(selectedSlot.props.style)).toMatchObject({
      width: '100%',
      minHeight: 44,
    })
    expect(StyleSheet.flatten(selectedSlot.props.style)).not.toHaveProperty('borderWidth')
    const selectedRing = tree.root.findByProps({ testID: 'day-selection-ring' })
    expect(StyleSheet.flatten(selectedRing.props.style)).toMatchObject({
      position: 'absolute',
      top: 0, right: 0, bottom: 0, left: 0,
      borderColor: tokens.primary,
      borderWidth: 2,
    })
  })


  it('keeps read-only dates selectable without making their DayCell writable', () => {
    const tokens = createTokensV2('purple', 'dark')
    const onSelectDay = vi.fn()
    const days = [
      gridDay('2026-09-03'),
      gridDay('2026-09-04'),
      ...Array.from({ length: 7 }, (_, index) => gridDay(`2026-09-${String(index + 5).padStart(2, '0')}`)),
      gridDay('2026-09-12'),
    ]
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarGrid
          gridDays={days}
          weekdayHeaders={[{ key: 'friday', label: 'F' }]}
          selectedDay={null}
          isLoading={false}
          onSelectDay={onSelectDay}
          language="en"
          t={(key) => key}
          tokens={tokens}
        />,
      )
    })

    const selectionButtons = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button',
    )
    expect(selectionButtons).toHaveLength(days.length)

    const readOnlyDay = tree.root.findAll(
      (node) => node.props.testID === 'day-cell-none' &&
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.includes('2026-09-03'),
    )[0]!
    expect(readOnlyDay.props.accessibilityRole).toBe('image')
    expect(readOnlyDay.props.accessibilityLabel).toContain('calendar.dayCell.readOnly')
    expect(readOnlyDay.props).not.toHaveProperty('onPress')
    expect(tree.root.findByProps({ testID: 'day-future-numeral' }).props).not.toHaveProperty('onPress')

    const oldDayPress = tree.root.findByProps({ testID: 'calendar-day-select-2026-09-03' }).props.onPress
    const futureDayPress = tree.root.findByProps({ testID: 'calendar-day-select-2026-09-12' }).props.onPress
    expect(tree.root.findByProps({ testID: 'calendar-day-select-2026-09-03' }).props.accessibilityLabel)
      .toContain('calendar.dayCell.readOnly')
    if (typeof oldDayPress !== 'function' || typeof futureDayPress !== 'function') {
      throw new Error('Expected calendar selection controls')
    }
    TestRenderer.act(() => oldDayPress())
    TestRenderer.act(() => futureDayPress())
    expect(onSelectDay).toHaveBeenNthCalledWith(1, '2026-09-03')
    expect(onSelectDay).toHaveBeenNthCalledWith(2, '2026-09-12')
  })

  it('moves the write window when the app today source advances', () => {
    const tokens = createTokensV2('purple', 'dark')
    const days = Array.from({ length: 9 }, (_, index) =>
      gridDay(`2026-09-${String(index + 4).padStart(2, '0')}`),
    )
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarGrid
          gridDays={days}
          weekdayHeaders={[{ key: 'friday', label: 'F' }]}
          selectedDay={null}
          isLoading={false}
          onSelectDay={vi.fn()}
          language="en"
          t={(key) => key}
          tokens={tokens}
        />,
      )
    })

    expect(StyleSheet.flatten(
      tree.root.findByProps({ testID: 'calendar-day-slot-2026-09-04' }).findAll((node) => node.type === 'View' && node.props.testID === 'day-circle')[0]!.props.style,
    ).backgroundColor).toBe(tokens.bgWell)

    todaySource.value = '2026-09-12'
    TestRenderer.act(() => {
      tree.update(
        <CalendarGrid
          gridDays={days}
          weekdayHeaders={[{ key: 'friday', label: 'F' }]}
          selectedDay={null}
          isLoading={false}
          onSelectDay={vi.fn()}
          language="en"
          t={(key) => key}
          tokens={tokens}
        />,
      )
    })

    expect(StyleSheet.flatten(
      tree.root.findByProps({ testID: 'calendar-day-slot-2026-09-04' }).findAll((node) => node.type === 'View' && node.props.testID === 'day-circle')[0]!.props.style,
    ).backgroundColor).toBe('transparent')
    expect(StyleSheet.flatten(
      tree.root.findByProps({ testID: 'calendar-day-slot-2026-09-12' }).findAll((node) => node.type === 'View' && node.props.testID === 'day-circle')[0]!.props.style,
    ).backgroundColor).toBe(tokens.bgWell)
    expect(tree.root.findByProps({ testID: 'calendar-day-select-2026-09-04' }).props.accessibilityLabel)
      .not.toContain('calendar.dayCell.today')
    expect(tree.root.findByProps({ testID: 'calendar-day-select-2026-09-12' }).props.accessibilityLabel)
      .toContain('calendar.dayCell.today')
  })


})
