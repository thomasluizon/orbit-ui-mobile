import React from 'react'
import { View } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import CalendarScreen from '@/app/(tabs)/calendar'
import { measureDaySurface, type GeometryHost } from '@/__tests__/support/calendar-grid-geometry'
import { __setWindowDimensions } from '../../test-mocks/react-native'

interface TestNode {
  type: unknown
  props: Record<string, unknown>
}

interface CalendarTree {
  toJSON(): GeometryHost | GeometryHost[]
  unmount(): void
  root: { findAll(predicate: (node: TestNode) => boolean): TestNode[] }
}

const TestRenderer: { create(element: React.ReactNode): CalendarTree; act(callback: () => void): void } = require('react-test-renderer')

const source = vi.hoisted(() => ({ loading: false, dayMap: new Map<string, CalendarDayEntry[]>() }))

vi.mock('react-native', async () => {
  const native = await import('../../test-mocks/react-native')
  return { ...native, FlatList: React.forwardRef((props: React.ComponentProps<typeof native.FlatList>, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollToOffset: vi.fn() }))
    return <native.FlatList {...props}>
      <native.View style={props.ListHeaderComponentStyle}>{React.isValidElement(props.ListHeaderComponent) ? props.ListHeaderComponent : null}</native.View>
    </native.FlatList>
  }) }
})

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useLocalSearchParams: () => ({}) }))
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [] }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { weekStartDay: 1, timeZone: 'UTC', hasProAccess: false }, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ data: { status: 'connected', events: [] }, isPending: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/use-calendar-auto-sync', () => ({
  useCalendarAutoSyncState: () => ({ data: { enabled: true, status: 'Idle', lastSyncedAt: null, hasGoogleConnection: true } }),
  useSetCalendarAutoSync: () => ({ mutateAsync: vi.fn() }),
  useRunCalendarSyncNow: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() }) }))
vi.mock('@/hooks/use-horizontal-swipe', () => ({ useHorizontalSwipe: () => undefined }))
vi.mock('@/hooks/use-habits', () => ({
  useCalendarData: () => ({ dayMap: source.dayMap, isLoading: source.loading, isFetching: false, error: null, refresh: vi.fn() }),
  useCalendarRange: () => ({ dayMap: source.dayMap, isLoading: source.loading, isFetching: false, error: null, refresh: vi.fn() }),
  useLogHabit: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))
vi.mock('@/components/calendar-sync/calendar-import-content', () => ({ CalendarImportContent: () => null }))
vi.mock('@/app/(tabs)/calendar/_components/calendar-day-detail', () => ({ CalendarDayDetail: () => <View /> }))

function monthHeader(screen: CalendarTree): CalendarTree {
  const list = screen.root.findAll((node) => node.type === 'FlatList')[0]!
  let header!: CalendarTree
  TestRenderer.act(() => { header = TestRenderer.create(<View>{list.props.ListHeaderComponent as React.ReactNode}</View>) })
  return header
}

function expectCircle(box: ReturnType<typeof measureDaySurface>[number]) {
  expect(box.width, box.testID).toBeLessThanOrEqual(44)
  expect(box.width, box.testID).toBeCloseTo(box.height, 4)
  expect(box.centerX, box.testID).toBeCloseTo(box.column.centerX, 4)
  expect(Number(box.style.borderRadius), box.testID).toBeGreaterThanOrEqual(box.width / 2)
}

function expectDays(tree: CalendarTree, width: number, view: 'month' | 'range') {
  const boxes = measureDaySurface(tree.toJSON(), width)
  const discs = boxes.filter((box) => box.testID === 'day-disc')
  expect(discs.length).toBeGreaterThanOrEqual(14)
  for (const disc of discs) { expect(disc.width).toBe(34); expectCircle(disc) }
  const today = boxes.filter((box) => box.testID === 'day-today-ring')
  expect(today).toHaveLength(1)
  for (const ring of today) { expectCircle(ring); expect(ring.style.borderWidth).toBe(2) }
  const fills = boxes.filter((box) => box.style.backgroundColor && box.style.backgroundColor !== 'transparent')
  for (const fill of fills.filter((box) => box.day)) expectCircle(fill)
  const targets = boxes.filter((box) => box.testID?.startsWith(view === 'month' ? 'calendar-day-select-' : 'day-cell-'))
  expect(targets).toHaveLength(view === 'month' ? 30 : 14)
  for (const target of targets) { expect(target.width).toBeCloseTo(target.column.width, 4); expect(target.height).toBeGreaterThanOrEqual(44) }
  const header = boxes.find((box) => box.testID === 'month-grid-header')!
  const firstRow = boxes.find((box) => box.testID === 'month-grid-row-0')!
  expect(firstRow.top - header.top - header.height).toBe(8)
  if (view === 'month') {
    const selection = boxes.filter((box) => box.testID === 'day-today-ring' || box.testID === 'day-selection-ring')
    expect(selection).toHaveLength(boxes.some((box) => box.testID === 'day-selection-ring') ? 2 : 1)
    for (const ring of selection) expectCircle(ring)
  }
}

function expectFullToday(tree: CalendarTree, width: number, selected?: boolean) {
  const boxes = measureDaySurface(tree.toJSON(), width)
  const ring = boxes.find((box) => box.testID === 'day-today-ring')!
  const disc = boxes.find((box) => box.testID === 'day-disc' && Math.abs(box.centerX - ring.centerX) < 0.5 && Math.abs(box.centerY - ring.centerY) < 0.5)!
  expect(disc.style.backgroundColor).not.toBe('transparent')
  expect(disc.width).toBe(34)
  expect(ring.width).toBe(Math.min(44, ring.column.width))
  expect(ring.style.borderWidth).toBe(2)
  expectCircle(ring)
  if (selected !== undefined) {
    const target = tree.root.findAll((node) => node.type === 'Pressable' && node.props.testID === 'calendar-day-select-2026-09-11')[0]!
    expect(target.props.accessibilityState).toEqual({ selected })
  }
}

describe('Calendar day circle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T12:00:00Z'))
    const completed: CalendarDayEntry = { habitId: 'walk', title: 'Walking', status: 'completed', isBadHabit: false, dueTime: null, isOneTime: false }
    const missed: CalendarDayEntry = { ...completed, habitId: 'read', title: 'Reading', status: 'missed' }
    source.dayMap = new Map([['2026-09-09', [completed]], ['2026-09-10', [completed, missed]], ['2026-09-11', [completed, { ...completed, habitId: 'read' }]]])
  })
  afterEach(() => vi.useRealTimers())

  it.each([320, 412])('retains loading circle centres at $width', (width) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    const snapshots: ReturnType<typeof measureDaySurface>[] = []
    for (const loading of [true, false]) {
      source.loading = loading
      let screen!: CalendarTree
      TestRenderer.act(() => { screen = TestRenderer.create(<CalendarScreen />) })
      const header = monthHeader(screen)
      const boxes = measureDaySurface(header.toJSON(), width)
      snapshots.push(boxes.filter((box) => loading ? box.style.aspectRatio === 1 && box.style.backgroundColor : box.testID === 'day-circle'))
      TestRenderer.act(() => { header.unmount(); screen.unmount() })
    }
    expect(snapshots[0]).toHaveLength(snapshots[1]!.length)
    for (const [index, before] of snapshots[0]!.entries()) {
      const after = snapshots[1]![index]!
      for (const dimension of ['centerX', 'centerY', 'width', 'height'] as const) expect(before[dimension], dimension).toBeCloseTo(after[dimension], 4)
    }
  })

  it.each([320, 412])('keeps every painted state circular at $width', (width) => {
    source.loading = false
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    let screen!: CalendarTree
    let header: CalendarTree | undefined
    TestRenderer.act(() => { screen = TestRenderer.create(<CalendarScreen />) })
    try {
      header = monthHeader(screen)
      expectDays(header, width, 'month')
      expectFullToday(header, width, true)
      const select = header.root.findAll((node) => node.type === 'Pressable' && node.props.testID === 'calendar-day-select-2026-09-10')[0]!
      for (const event of ['onPressIn', 'onPressOut', 'onFocus', 'onBlur']) {
        const handler = select.props[event]
        expect(handler, event).toBeTypeOf('function')
        TestRenderer.act(() => { (handler as () => void)() })
        const fills = measureDaySurface(header.toJSON(), width).filter((box) => box.testID === 'day-press-fill')
        if (event === 'onPressIn') expect(fills).toHaveLength(1)
        for (const fill of fills) expectCircle(fill)
        expectDays(header, width, 'month')
      }
      const onSelect = select.props.onPress as () => void
      TestRenderer.act(() => { onSelect() })
      TestRenderer.act(() => { header!.unmount() })
      header = monthHeader(screen)
      expectDays(header, width, 'month')
      expectFullToday(header, width, false)
      const range = header.root.findAll((node) => node.type === 'Pressable' && String(node.props.testID).startsWith('segment-range-'))[0]!
      TestRenderer.act(() => { (range.props.onPress as () => void)() })
      expectDays(screen, width, 'range')
      expectFullToday(screen, width)
    } finally {
      TestRenderer.act(() => { header?.unmount(); screen.unmount() })
    }
  })
})
