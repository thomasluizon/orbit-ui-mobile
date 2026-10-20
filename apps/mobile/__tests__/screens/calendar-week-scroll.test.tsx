import React from 'react'
import { act } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CalendarScreen from '@/app/(tabs)/calendar'
import { __setWindowDimensions, __setTouchMode, __focusHost, __getFocusedNativeTag } from '../../test-mocks/react-native'

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  parent: TestNode | null
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}
interface TestTree {
  root: TestNode
  update: (element: React.ReactElement) => void
}
const { create } = require('react-test-renderer') as { create: (element: React.ReactNode) => TestTree }

vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [] }) }))
const scrollToOffset = vi.hoisted(() => vi.fn())
vi.mock('react-native', async () => {
  const React = await import('react')
  const native = await import('../../test-mocks/react-native')
  return { ...native, FlatList: React.forwardRef((props: React.ComponentProps<typeof native.FlatList>, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollToOffset }))
    return <native.FlatList {...props}>
      <native.View style={props.ListHeaderComponentStyle}>{React.isValidElement(props.ListHeaderComponent) ? props.ListHeaderComponent : null}</native.View>
      {React.isValidElement(props.ListFooterComponent) ? props.ListFooterComponent : null}
    </native.FlatList>
  }) }
})
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/calendar',
  useLocalSearchParams: () => ({}),
}))

vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0 }),
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/calendar-sync/calendar-import-content', () => ({ CalendarImportContent: () => null }))

vi.mock('@/hooks/use-habits', () => ({
  useCalendarData: () => ({
    dayMap: new Map(),
    isLoading: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
  }),
  useCalendarRange: () => ({
    dayMap: new Map(),
    isLoading: false,
    isFetching: false,
    error: null,
    refresh: vi.fn(),
  }),
  useLogHabit: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: {
      weekStartDay: 1,
      timeZone: 'UTC',
      hasProAccess: false,
      hasGoogleConnection: true,
      googleCalendarAutoSyncEnabled: true,
      googleCalendarAutoSyncStatus: 'Idle',
      googleCalendarLastSyncedAt: '2026-09-12T09:12:00Z',
    },
  }),
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (value: string) => value }),
}))

vi.mock('@/hooks/use-calendar-events', () => ({
  useCalendarEvents: () => ({
    data: { status: 'connected', events: [] },
  }),
}))

vi.mock('@/hooks/use-calendar-auto-sync', () => ({
  useCalendarAutoSyncState: () => ({ data: { enabled: false, status: 'Idle', lastSyncedAt: null, hasGoogleConnection: false } }),
  useSetCalendarAutoSync: () => ({ mutateAsync: vi.fn() }),
  useRunCalendarSyncNow: () => ({ mutateAsync: vi.fn(async () => {}) }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn() }),
}))
vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: true }),
}))

function ancestors(node: TestNode) {
  const parents: TestNode[] = []
  for (let parent = node.parent; parent; parent = parent.parent) parents.push(parent)
  return parents
}

function scrollOwners(node: TestNode) {
  return ancestors(node).filter((parent) => (parent.type === 'ScrollView' || parent.type === 'FlatList')
    && !parent.props.horizontal && parent.props.scrollEnabled !== false)
}

let tree: TestTree | undefined

afterEach(async () => {
  await act(() => tree?.update(<></>))
  __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
  __setTouchMode(true)
})

describe('Calendar week scroll ownership', () => {
  it('keeps the same header and view switch nodes focused when entering and leaving week', async () => {
    __setTouchMode(false)
    await act(() => { tree = create(<CalendarScreen />) })
    const header = tree!.root.findAll((node) => node.type === 'View' && node.props.testID === 'calendar-header-group')[0]!
    const selector = header.findAll((node) => node.type === 'View' && node.props.accessibilityRole === 'radiogroup')[0]!
    const radios = header.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio')
    const previous = header.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'common.previousMonth')[0]!
    const next = header.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'common.nextMonth')[0]!
    const title = header.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button')[1]!
    for (const [step, index] of [0, 1, 2, 1, 0, 3, 0].entries()) {
      const nativeTag = radios[index]!.props.__nativeTag
      if (typeof nativeTag !== 'number') throw new Error('Radio native handle missing')
      scrollToOffset.mockClear()
      await act(() => __focusHost(nativeTag))
      const currentHeader = tree!.root.findAll((node) => node.type === 'View' && node.props.testID === 'calendar-header-group')[0]!
      expect(currentHeader === header).toBe(true)
      expect(currentHeader.findAll((node) => node.type === 'View' && node.props.accessibilityRole === 'radiogroup')[0] === selector).toBe(true)
      currentHeader.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio').forEach((radio, radioIndex) => expect(radio === radios[radioIndex]).toBe(true))
      expect(radios[index]!.props.accessibilityState).toMatchObject({ checked: true })
      expect(__getFocusedNativeTag()).toBe(nativeTag)
      if (step > 0) {
        expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false })
      }
      expect(currentHeader.findAll((node) => node === previous || node === next || node === title)).toHaveLength(3)
    }
  })

  it.each([[1352, 726, 1], [1100, 726, 1], [412, 640, 1], [1352, 726, 2], [1100, 726, 2], [412, 640, 2]])(
    'keeps one hour scroller with the weekday pane as its sticky first child at %sx%s with font scale %s',
    async (width, height, fontScale) => {
      __setWindowDimensions({ width, height, scale: 1, fontScale })
      await act(() => { tree = create(<CalendarScreen />) })
      const week = tree!.root.findAll((node) => node.type === 'Pressable'
        && String(node.props.testID).startsWith('segment-week-'))[0]!
      const onPress = week.props.onPress
      if (typeof onPress !== 'function') throw new Error('Week selection missing')
      await act(() => onPress())

      const column = tree!.root.findAll((node) => node.type === 'View'
        && node.props.testID === 'time-grid-day-column')[0]!
      const owners = scrollOwners(column)
      expect(owners).toHaveLength(1)
      const header = tree!.root.findAll((node) => node.type === 'View' && node.props.testID === 'calendar-header-group')[0]!
      expect(scrollOwners(header)).toHaveLength(0)
      const weekday = tree!.root.findAll((node) => node.type === 'Pressable'
        && node.props.testID === 'time-grid-col-header')[0]!
      expect(ancestors(weekday)).toContain(owners[0])
      expect(scrollOwners(weekday)).toEqual(owners)
      expect(owners[0]!.props.stickyHeaderIndices).toEqual([0])
      expect(ancestors(weekday).some((node) => node.type === 'ScrollView' && node.props.horizontal)).toBe(true)
    },
  )
})
