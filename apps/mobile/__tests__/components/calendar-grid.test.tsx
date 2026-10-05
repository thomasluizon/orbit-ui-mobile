import React, { type ComponentProps } from 'react'
import { StyleSheet } from 'react-native'
import * as ReactNative from 'react-native'
import Yoga, { type Node as YogaNode } from 'yoga-layout'
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

interface GeometryHost {
  props: { testID?: string; style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>) }
  children: (GeometryHost | string)[] | null
}

function applyGridDimensions(node: YogaNode, style: ViewStyle) {
  if (typeof style.width === 'number' || style.width === '100%') node.setWidth(style.width)
  if (typeof style.maxWidth === 'number') node.setMaxWidth(style.maxWidth)
  if (typeof style.minWidth === 'number') node.setMinWidth(style.minWidth)
  if (typeof style.height === 'number') node.setHeight(style.height)
  if (typeof style.minHeight === 'number') node.setMinHeight(style.minHeight)
}

function applyGridStyle(node: YogaNode, style: ViewStyle) {
  applyGridDimensions(node, style)
  if (style.flex !== undefined) node.setFlex(style.flex)
  if (style.flexDirection === 'row') node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW)
  if (style.flexWrap === 'wrap') node.setFlexWrap(Yoga.WRAP_WRAP)
  if (style.alignItems === 'center') node.setAlignItems(Yoga.ALIGN_CENTER)
  if (style.alignSelf === 'center') node.setAlignSelf(Yoga.ALIGN_CENTER)
  if (typeof style.gap === 'number') node.setGap(Yoga.GUTTER_ALL, style.gap)
  if (typeof style.rowGap === 'number') node.setGap(Yoga.GUTTER_ROW, style.rowGap)
  if (typeof style.columnGap === 'number') node.setGap(Yoga.GUTTER_COLUMN, style.columnGap)
  if (typeof style.paddingHorizontal === 'number') node.setPadding(Yoga.EDGE_HORIZONTAL, style.paddingHorizontal)
  if (style.position === 'absolute') node.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE)
  for (const [property, edge] of [['top', Yoga.EDGE_TOP], ['bottom', Yoga.EDGE_BOTTOM], ['left', Yoga.EDGE_LEFT], ['right', Yoga.EDGE_RIGHT]] as const) {
    const offset = style[property] ?? style.inset
    if (typeof offset === 'number') node.setPosition(edge, offset)
  }
}

function measureGrid(host: GeometryHost, width: number, view: 'month' | 'range', isLoading: boolean) {
  const selected = new Map<string, YogaNode>()
  const targets: YogaNode[] = []
  function build(current: GeometryHost): YogaNode {
    const node = Yoga.Node.create()
    const declared = current.props.style
    applyGridStyle(node, StyleSheet.flatten(typeof declared === 'function' ? declared({ pressed: false }) : declared ?? {}))
    if (current.props.testID) {
      selected.set(current.props.testID, node)
      const prefix = view === 'month' ? 'calendar-day-select-' : 'day-cell-'
      if (current.props.testID.startsWith(prefix)) targets.push(node)
    }
    for (const child of current.children ?? []) {
      if (typeof child !== 'string') node.insertChild(build(child), node.getChildCount())
    }
    return node
  }
  const root = build(host)
  try {
    root.calculateLayout(width, 'auto', Yoga.DIRECTION_LTR)
    const card = view === 'range' ? selected.get('month-grid-7-columns')!.getParent()!
      : isLoading ? selected.get('skeleton-unit-grid')!.getParent()! : selected.get('calendar-grid-card')!
    const frame = view === 'range' ? card : selected.get('calendar-grid')!
    return {
      cardWidth: card.getComputedWidth() - (view === 'range' ? 8 : 0),
      contentWidth: width - 8,
      frameWidth: frame.getComputedWidth(),
      targets: targets.map((node) => ({ width: node.getComputedWidth(), height: node.getComputedHeight(), columnWidth: node.getParent()!.getComputedWidth() })),
    }
  } finally { root.freeRecursive() }
}

describe('CalendarGrid (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T12:00:00'))
    todaySource.value = '2026-09-11'
  })

  afterEach(() => vi.useRealTimers())

  it.each([320, 600, 840, 1100, 1352].flatMap((width) => [false, true].flatMap((isLoading) =>
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
          : <CalendarRangeView model={range} weekdayLabels={weekdayLabels} rangeLabel="Range" previousRangeLabel="Previous" nextRangeLabel="Next"
              onPreviousRange={vi.fn()} onNextRange={vi.fn()} nextRangeDisabled={false} isLoading={isLoading} loadingLabel="Loading"
              stats={[{ key: 'bestStreak', value: range.stats.bestStreak, label: 'Streak' }, { key: 'totalLogs', value: range.stats.totalLogs, label: 'Logs' }, { key: 'missed', value: range.stats.missed, label: 'Missed' }]}
              language="en" t={i18n.t} tokens={tokens} />)
      })
      const geometry = measureGrid(tree.toJSON(), width, view, isLoading)
      expect(geometry.frameWidth).toBe(width)
      expect(geometry.cardWidth).toBe(geometry.contentWidth)
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

    const shape = tree.root.findByProps({ testID: 'skeleton-grid-shape' })
    expect(StyleSheet.flatten(shape.props.style)).toMatchObject({ width: 332, height: 284, gap: 4 })
    expect(tree.root.findAll((node) => node.props.testID === 'month-grid-header')).toHaveLength(0)
    expect(tree.root.findAll((node) => node.props.testID === 'calendar-day-skeleton')).toHaveLength(0)
  })

  it('keeps selected and future presentation on the month-grid wrapper', () => {
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
    const futureNumeral = tree.root.findByProps({ testID: 'calendar-future-day-2026-09-12' })
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
      minWidth: 44,
      height: 44,
      backgroundColor: tokens.selectionBg,
    })
    expect(StyleSheet.flatten(selectedSlot.props.style)).not.toHaveProperty('borderWidth')
    const selectedRing = tree.root.findByProps({ testID: 'calendar-day-selection-2026-09-10' })
    expect(StyleSheet.flatten(selectedRing.props.style)).toMatchObject({
      position: 'absolute',
      inset: 0,
      borderColor: tokens.primary,
      borderWidth: 2,
    })
  })

  it('paints a range endpoint with one selection tint and one selected ring', () => {
    const tokens = createTokensV2('purple', 'dark')
    const endpoint = gridDay('2026-09-10')
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarGrid
          gridDays={[endpoint]}
          weekdayHeaders={[{ key: 'wednesday', label: 'W' }]}
          selectedDay={null}
          isLoading={false}
          rangeStart={endpoint.dateStr}
          rangeEnd={endpoint.dateStr}
          onSelectDay={vi.fn()}
          language="en"
          t={(key) => key}
          tokens={tokens}
        />,
      )
    })

    const tintedLayers = tree.root.findAll((node) => {
      if (typeof node.type !== 'string' || node.props.style == null || typeof node.props.style === 'function') return false
      return StyleSheet.flatten(node.props.style).backgroundColor === tokens.selectionBg
    })
    const selectedRings = tree.root.findAll((node) => {
      if (typeof node.type !== 'string' || node.props.style == null || typeof node.props.style === 'function') return false
      const style = StyleSheet.flatten(node.props.style)
      return style.borderColor === tokens.primary && style.borderWidth === 2
    })

    expect(tintedLayers).toHaveLength(1)
    expect(selectedRings).toHaveLength(1)
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
    expect(tree.root.findByProps({ testID: 'calendar-future-day-2026-09-12' }).props).not.toHaveProperty('onPress')

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
      tree.root.findByProps({ testID: 'calendar-day-slot-2026-09-04' }).props.style,
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
      tree.root.findByProps({ testID: 'calendar-day-slot-2026-09-04' }).props.style,
    ).backgroundColor).toBe('transparent')
    expect(StyleSheet.flatten(
      tree.root.findByProps({ testID: 'calendar-day-slot-2026-09-12' }).props.style,
    ).backgroundColor).toBe(tokens.bgWell)
    expect(tree.root.findByProps({ testID: 'calendar-day-select-2026-09-04' }).props.accessibilityLabel)
      .not.toContain('calendar.dayCell.today')
    expect(tree.root.findByProps({ testID: 'calendar-day-select-2026-09-12' }).props.accessibilityLabel)
      .toContain('calendar.dayCell.today')
  })

  it('keeps future range picks actionable without raising them as loggable days', () => {
    const tokens = createTokensV2('purple', 'dark')
    const onSelectDay = vi.fn()
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <CalendarGrid
          gridDays={[gridDay('2026-09-11'), gridDay('2026-09-12')]}
          weekdayHeaders={[{ key: 'saturday', label: 'S' }]}
          selectedDay={null}
          rangeStart="2026-09-12"
          isLoading={false}
          onSelectDay={onSelectDay}
          language="en"
          t={(key) => key}
          tokens={tokens}
          interaction="range-picker"
        />,
      )
    })

    const button = tree.root.findByProps({ testID: 'calendar-day-select-2026-09-12' })
    expect(button.props.accessibilityState).toEqual({ selected: true })
    expect(tree.root.findByProps({ testID: 'calendar-day-select-2026-09-11' }).props.accessibilityLabel)
      .toContain('calendar.dayCell.readOnly')
    const selectedBackground = StyleSheet.flatten(
      tree.root.findByProps({ testID: 'calendar-day-slot-2026-09-12' }).props.style,
    ).backgroundColor
    expect(selectedBackground).toBe(tokens.selectionBg)
    expect(selectedBackground).not.toBe(tokens.bgWell)
    const onPress = button.props.onPress
    if (typeof onPress !== 'function') throw new Error('Expected range endpoint button')
    TestRenderer.act(() => onPress())
    expect(onSelectDay).toHaveBeenCalledWith('2026-09-12')
  })
})
