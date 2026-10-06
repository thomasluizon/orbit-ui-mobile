import React from 'react'
import { act } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CalendarScreen from '@/app/(tabs)/calendar'
import { __setWindowDimensions } from '../../test-mocks/react-native'

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
  return ancestors(node).filter((parent) => parent.type === 'ScrollView'
    && !parent.props.horizontal && parent.props.scrollEnabled !== false)
}

let tree: TestTree | undefined

afterEach(async () => {
  await act(() => tree?.update(<></>))
  __setWindowDimensions({ width: 412, height: 892, scale: 1, fontScale: 1 })
})

describe('Calendar week scroll ownership', () => {
  it.each([[1352, 726, 1], [1100, 726, 1], [412, 640, 1], [412, 640, 2]])(
    'keeps one hour scroller and the weekday header outside it at %sx%s with font scale %s',
    async (width, height, fontScale) => {
      __setWindowDimensions({ width, height, scale: 1, fontScale })
      await act(() => { tree = create(<CalendarScreen />) })
      const list = tree!.root.findAll((node) => node.type === 'FlatList')[0]!
      let header!: TestTree
      const monthHeader = list.props.ListHeaderComponent
      if (!React.isValidElement(monthHeader)) throw new Error('Month header missing')
      await act(() => { header = create(monthHeader) })
      const week = header.root.findAll((node) => node.type === 'Pressable'
        && String(node.props.testID).startsWith('segment-week-'))[0]!
      const onPress = week.props.onPress
      if (typeof onPress !== 'function') throw new Error('Week selection missing')
      await act(() => onPress())
      await act(() => header.update(<></>))

      const column = tree!.root.findAll((node) => node.type === 'View'
        && node.props.testID === 'time-grid-day-column')[0]!
      const owners = scrollOwners(column)
      expect(owners).toHaveLength(1)
      const weekday = tree!.root.findAll((node) => node.type === 'Pressable'
        && node.props.testID === 'time-grid-col-header')[0]!
      expect(ancestors(weekday)).not.toContain(owners[0])
      expect(scrollOwners(weekday)).toHaveLength(0)
      expect(ancestors(weekday).some((node) => node.type === 'ScrollView' && node.props.horizontal)).toBe(true)
    },
  )
})
