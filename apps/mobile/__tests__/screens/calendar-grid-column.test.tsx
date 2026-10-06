import React from 'react'
import { View } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import CalendarScreen from '@/app/(tabs)/calendar'
import { measureGrid, type GeometryHost } from '@/__tests__/support/calendar-grid-geometry'
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

function expectColumn(geometry: ReturnType<typeof measureGrid>, width: number, view: 'month' | 'range', loading: boolean) {
  expect(geometry.inlineInset).toBe(16)
  expect(geometry.switchEdges).toBeDefined()
  expect(Math.abs(geometry.gridEdges.left - geometry.switchEdges!.left)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(geometry.gridEdges.right - geometry.switchEdges!.right)).toBeLessThanOrEqual(0.5)
  expect(geometry.cardWidth).toBe(width - 32)
  expect(geometry.targets).toHaveLength(loading ? 0 : view === 'month' ? 30 : 14)
  for (const target of geometry.targets) {
    expect(target.height).toBeGreaterThanOrEqual(44)
    expect(target.width).toBeCloseTo(target.columnWidth, 1)
  }
  for (const disc of geometry.discs) expect(disc.width).toBeLessThanOrEqual(disc.columnWidth + 0.5)
  for (const placeholder of geometry.placeholders) expect(placeholder.width).toBeLessThanOrEqual(placeholder.columnWidth + 0.5)
}

describe('Calendar screen grid column', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T12:00:00Z'))
    const completed: CalendarDayEntry = { habitId: 'walk', title: 'Walking', status: 'completed', isBadHabit: false, dueTime: null, isOneTime: false }
    const missed: CalendarDayEntry = { ...completed, habitId: 'read', title: 'Reading', status: 'missed' }
    source.dayMap = new Map([['2026-09-09', [completed]], ['2026-09-10', [completed, missed]], ['2026-09-11', [missed]]])
  })
  afterEach(() => vi.useRealTimers())

  it.each([320, 412].flatMap((width) => [false, true].map((loading) => ({ width, loading }))))('aligns both views at $width (loading=$loading)', ({ width, loading }) => {
    source.loading = loading
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    let screen!: CalendarTree
    let header: CalendarTree | undefined
    TestRenderer.act(() => { screen = TestRenderer.create(<CalendarScreen />) })
    try {
      header = monthHeader(screen)
      for (const view of ['month', 'range'] as const) {
        const tree = view === 'month' ? header! : screen
        const geometry = measureGrid(tree.toJSON(), width, view, loading)
        expectColumn(geometry, width, view, loading)
        if (view === 'month') {
          const range = header!.root.findAll((node) => node.type === 'Pressable' && String(node.props.testID).startsWith('segment-range-'))[0]!
          const onPress = range.props.onPress
          if (typeof onPress !== 'function') throw new Error('Expected the range view control')
          TestRenderer.act(() => { onPress() })
          TestRenderer.act(() => { header!.unmount() })
          header = undefined
        }
      }
    } finally {
      TestRenderer.act(() => { header?.unmount(); screen.unmount() })
    }
  })
})
