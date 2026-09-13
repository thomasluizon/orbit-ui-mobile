import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarScreen from '@/app/(tabs)/calendar'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import type { CalendarAutoSyncState } from '@orbit/shared/types/calendar'

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
}))

vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@/hooks/use-habits', () => ({
  useCalendarData: () => ({
    dayMap: new Map(),
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
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: vi.fn() }),
}))

vi.mock('@/hooks/use-tour-target', () => ({
  useTourTarget: () => {},
}))

vi.mock('@/hooks/use-tour-scroll-container', () => ({
  useTourScrollContainer: () => ({ onTourScroll: vi.fn() }),
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
    sheetTestControls.defer(true)
  })

  afterEach(() => {
    sheetTestControls.defer(false)
    vi.useRealTimers()
  })

  it('navigates to the selected day only after the sheet finishes dismissing natively, and exactly once', () => {
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    const dayCell = findGridDayCell(tree.root, '2026-08-15')
    TestRenderer.act(() => {
      ;(dayCell.props.onPress as () => void)()
    })

    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(1)

    TestRenderer.act(() => {
      pressButton(tree.root, 'calendar.goToDay')
    })

    /** The sheet is still mounted and presented, so nothing may run yet. */
    expect(mockPush).not.toHaveBeenCalled()
    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(1)
    expect(sheetTestControls.isDismissPending).toBe(true)

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(mockPush).toHaveBeenCalledTimes(1)
    const pushedHref = mockPush.mock.calls[0]?.[0] as string
    expect(pushedHref).toMatch(/^\/\?date=\d{4}-\d{2}-15$/)
    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(0)

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it('dismisses the free-plan day sheet before opening Orbit Pro', () => {
    profileHasProAccess = false
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    TestRenderer.act(() => {
      ;(findGridDayCell(tree.root, '2026-08-15').props.onPress as () => void)()
    })
    TestRenderer.act(() => {
      pressButton(tree.root, 'calendar.dayDetail.viewPro')
    })

    expect(mockPush).not.toHaveBeenCalled()
    expect(sheetTestControls.isDismissPending).toBe(true)

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(mockPush).toHaveBeenCalledOnce()
    expect(mockPush).toHaveBeenCalledWith('/upgrade')
    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(0)
  })

  it('keeps the changed auto-sync value after closing and reopening day detail', async () => {
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    expect(autoSyncQueryOptions).toEqual({
      enabled: true,
      initialData: {
        enabled: true,
        status: 'Idle',
        lastSyncedAt: '2026-09-12T09:12:00Z',
        hasGoogleConnection: true,
      },
    })
    TestRenderer.act(() => {
      ;(findGridDayCell(tree.root, '2026-08-15').props.onPress as () => void)()
    })

    const autoSync = tree.root.findAll(
      (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'calendar.dayDetail.autoSync',
    )[0]!
    await TestRenderer.act(() => {
      ;(autoSync.props.onPress as () => void)()
      return Promise.resolve()
    })

    TestRenderer.act(() => {
      const dismiss = tree.root.findAll(
        (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'attempt-dismiss',
      )[0]!
      ;(dismiss.props.onPress as () => void)()
      sheetTestControls.completeDismissal()
    })
    TestRenderer.act(() => {
      ;(findGridDayCell(tree.root, '2026-08-15').props.onPress as () => void)()
    })

    const reopened = tree.root.findAll(
      (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'calendar.dayDetail.autoSync',
    )[0]!
    const accessibilityState = reopened.props.accessibilityState as { checked?: boolean }
    expect(accessibilityState.checked).toBe(false)
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
    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(1)
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

  it('shows one stable grid skeleton while the month is loading', () => {
    calendarIsLoading = true
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    const shapes = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'skeleton-grid-shape',
    )
    expect(shapes).toHaveLength(1)
    expect(shapes[0]?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 332, height: 284, gap: 4 })]),
    )
    expect(tree.root.findAll((node) => node.props.testID === 'month-grid-header')).toHaveLength(0)
    expect(tree.root.findAll((node) => String(node.props.testID).startsWith('day-cell-'))).toHaveLength(0)
  })
})
