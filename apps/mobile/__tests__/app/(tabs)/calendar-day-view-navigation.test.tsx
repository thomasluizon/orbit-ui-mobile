import React from 'react'
import { StyleSheet } from 'react-native'
import { buildCalendarMonthModel } from '@orbit/shared/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarScreen from '@/app/(tabs)/calendar'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import type { CalendarAutoSyncState, CalendarDayEntry } from '@orbit/shared/types/calendar'

const mockPush = vi.fn()
const mockSetAutoSync = vi.fn(({ enabled }: { enabled: boolean }) => {
  autoSyncState = { ...autoSyncState, enabled }
  return Promise.resolve()
})

let calendarIsLoading = false
let profileHasProAccess = true
let autoSyncState: CalendarAutoSyncState = {
  enabled: true,
  status: 'Idle',
  lastSyncedAt: '2026-09-12T09:12:00Z',
  hasGoogleConnection: true,
}
let autoSyncQueryOptions: {
  enabled?: boolean
  initialData?: CalendarAutoSyncState
} | undefined
let calendarDayMap = new Map<string, CalendarDayEntry[]>()
const mockLogHabit = vi.fn(async () => {})
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [] }) }))
vi.mock('react-native', async () => {
  const ReactLib = require('react')
  const reactNative = await import('../../../test-mocks/react-native')

  function FlatListWithVirtualParts({
    ListHeaderComponent,
    ListFooterComponent,
    ...props
  }: Readonly<{
    ListHeaderComponent?: React.ReactNode
    ListFooterComponent?: React.ReactNode
    [key: string]: unknown
  }>) {
    return ReactLib.createElement(
      'FlatList',
      props,
      ReactLib.isValidElement(ListHeaderComponent) ? ListHeaderComponent : null,
      ReactLib.isValidElement(ListFooterComponent) ? ListFooterComponent : null,
    )
  }

  return {
    ...reactNative,
    FlatList: FlatListWithVirtualParts,
    default: { ...reactNative.default, FlatList: FlatListWithVirtualParts },
  }
})

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
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
    dayMap: calendarDayMap,
    isLoading: calendarIsLoading,
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
  useLogHabit: () => ({ mutateAsync: mockLogHabit }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: {
      weekStartDay: 1,
      timeZone: 'UTC',
      hasProAccess: profileHasProAccess,
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
  useCalendarAutoSyncState: (options?: {
    enabled?: boolean
    initialData?: CalendarAutoSyncState
  }) => {
    autoSyncQueryOptions = options
    return { data: autoSyncState }
  },
  useSetCalendarAutoSync: () => ({ mutateAsync: mockSetAutoSync }),
  useRunCalendarSyncNow: () => ({ mutateAsync: vi.fn(async () => {}) }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn() }),
}))
vi.mock('@/hooks/use-offline', () => ({
  useOffline: () => ({ isOnline: true }),
}))



interface TestNode {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

interface TestTree {
  root: TestNode
}

const TestRenderer = require('react-test-renderer')

function pressButton(root: TestNode, label: string) {
  const node = root.findAll(
    (candidate) =>
      candidate.type === 'Pressable' &&
      candidate.findAll(
        (child) => child.type === 'Text' && child.props.children === label,
      ).length > 0,
  )[0]
  if (!node) throw new Error(`Button not found: ${label}`)
  const onPress = node.props.onPress
  if (typeof onPress !== 'function') throw new Error(`Button missing onPress: ${label}`)
  onPress()
}

function findGridDayCell(root: TestNode, dateStr: string) {
  const slot = root.findAll(
    (candidate) => candidate.props.testID === `calendar-day-slot-${dateStr}`,
  )[0]
  const cell = slot?.findAll((candidate) => candidate.type === 'Pressable')[0]
  if (!cell) throw new Error(`Day cell not found: ${dateStr}`)
  return cell
}

describe('CalendarScreen day-detail navigation (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15))
    vi.clearAllMocks()
    calendarIsLoading = false
    profileHasProAccess = true
    autoSyncState = {
      enabled: true,
      status: 'Idle',
      lastSyncedAt: '2026-09-12T09:12:00Z',
      hasGoogleConnection: true,
    }
    autoSyncQueryOptions = undefined
    calendarDayMap = new Map()
    sheetTestControls.defer(true)
  })

  afterEach(() => {
    sheetTestControls.defer(false)
    vi.useRealTimers()
  })

  it('navigates directly from the inline selected day without opening a sheet', () => {
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    const dayCell = findGridDayCell(tree.root, '2026-08-15')
    TestRenderer.act(() => {
      ;(dayCell.props.onPress as () => void)()
    })

    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(0)

    TestRenderer.act(() => {
      pressButton(tree.root, 'calendar.goToDay')
    })

    expect(mockPush).toHaveBeenCalledTimes(1)
    const pushedHref = mockPush.mock.calls[0]?.[0] as string
    expect(pushedHref).toMatch(/^\/\?date=\d{4}-\d{2}-15$/)
    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(0)
  })

  it('opens Orbit Pro directly from the inline free-plan day card', () => {
    profileHasProAccess = false
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    TestRenderer.act(() => {
      ;(findGridDayCell(tree.root, '2026-08-15').props.onPress as () => void)()
    })
    TestRenderer.act(() => {
      pressButton(tree.root, 'calendar.proBoundary.action')
    })

    expect(mockPush).toHaveBeenCalledOnce()
    expect(mockPush).toHaveBeenCalledWith('/upgrade')
    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(0)
  })

  it('seeds sync state without placing sync controls in day detail', () => {
    let tree!: TestTree
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarScreen />) })
    expect(autoSyncQueryOptions?.initialData).toEqual(autoSyncState)
    expect(tree.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'calendar.dayDetail.autoSync')).toHaveLength(0)
  })

  it('opens an older current-month day through its read-only selection path', () => {
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    const olderDay = findGridDayCell(tree.root, '2026-08-01')
    expect(olderDay.props.accessibilityLabel).toContain('calendar.dayCell.readOnly')
    TestRenderer.act(() => {
      ;(olderDay.props.onPress as () => void)()
    })
    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(0)
    TestRenderer.act(() => {
      pressButton(tree.root, 'calendar.goToDay')
    })
    expect(mockPush).toHaveBeenCalledWith('/?date=2026-08-01')
  })

  it('logs a selected writable day with its selected date', () => {
    calendarDayMap = new Map([
      ['2026-08-15', [{
        habitId: 'habit-1',
        title: 'Read',
        status: 'upcoming',
        isBadHabit: false,
        dueTime: null,
        isOneTime: false,
      }]],
    ])
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    TestRenderer.act(() => {
      ;(findGridDayCell(tree.root, '2026-08-15').props.onPress as () => void)()
    })
    const checkRow = tree.root.findAll(
      (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'checkbox',
    )[0]
    if (!checkRow) throw new Error('Writable day checkbox not found')
    TestRenderer.act(() => {
      ;(checkRow.props.onPress as () => void)()
    })

    expect(mockLogHabit).toHaveBeenCalledWith({
      habitId: 'habit-1',
      date: '2026-08-15',
      intent: 'log',
    })
  })

  it('keeps range days read only and does not open day detail', () => {
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    TestRenderer.act(() => {
      pressButton(tree.root, 'calendar.view.range')
    })
    const rangeDays = tree.root.findAll(
      (node) =>
        node.type === 'View' &&
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('day-cell-'),
    )
    expect(rangeDays).toHaveLength(14)
    expect(rangeDays.every((day) => day.props.accessibilityRole === 'image')).toBe(true)
    expect(rangeDays.every((day) => day.props.onPress === undefined)).toBe(true)
    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(0)
  })

  it('keeps one named loading region with a placeholder for every month date', () => {
    calendarIsLoading = true
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    const shapes = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'skeleton-grid-shape',
    )
    const month = buildCalendarMonthModel(new Date(2026, 7, 1), calendarDayMap, 1, '2026-08-15')
    expect(shapes).toHaveLength(month.gridDays.length)
    for (const shape of shapes) expect(StyleSheet.flatten(shape.props.style)).toMatchObject({ width: 44, height: 44 })
    const grid = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'calendar-grid')[0]!
    const loadingRegions = grid.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'progressbar')
    expect(loadingRegions).toHaveLength(1)
    expect(loadingRegions[0]?.props).toMatchObject({ accessibilityLabel: 'calendar.loading', accessibilityState: { busy: true } })
    const header = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'month-grid-header')[0]!
    expect(StyleSheet.flatten(header.props.style)).toMatchObject({ opacity: 0 })
    expect(header.props.accessibilityElementsHidden).toBe(true)
    expect(header.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(tree.root.findAll((node) => String(node.props.testID).startsWith('day-cell-'))).toHaveLength(0)
  })
})
