import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarScreen from '@/app/(tabs)/calendar'
import { sheetTestControls } from '@/__tests__/support/sheet-double'

const mockPush = vi.fn()

let calendarIsLoading = false
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
  useProfile: () => ({ profile: { weekStartDay: 1 } }),
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (value: string) => value }),
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
  const cell = root.findAll(
    (candidate) => candidate.props.testID === `calendar-day-button-${dateStr}`,
  )[0]
  if (!cell) throw new Error(`Day cell not found: ${dateStr}`)
  return cell
}

describe('CalendarScreen day-detail navigation (mobile)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 15))
    vi.clearAllMocks()
    calendarIsLoading = false
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

  it('opens an older current-month day', () => {
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    TestRenderer.act(() => {
      ;(findGridDayCell(tree.root, '2026-08-01').props.onPress as () => void)()
    })
    expect(tree.root.findAll((node) => node.type === 'Sheet')).toHaveLength(1)
  })

  it('allows a future day to become a range endpoint', () => {
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    TestRenderer.act(() => {
      pressButton(tree.root, 'calendar.view.range')
    })
    TestRenderer.act(() => {
      ;(findGridDayCell(tree.root, '2026-08-20').props.onPress as () => void)()
    })
    const selectedDates = tree.root.findAll(
      (node) => node.type === 'Pressable' && (node.props.accessibilityState as { selected?: boolean } | undefined)?.selected === true,
    ).map((node) => node.props.testID)
    expect(selectedDates).toContain('calendar-day-button-2026-08-20')
  })

  it('shows only neutral same-size day placeholders while the month is loading', () => {
    calendarIsLoading = true
    let tree!: TestTree
    TestRenderer.act(() => {
      tree = TestRenderer.create(<CalendarScreen />)
    })

    const skeletons = tree.root.findAll((node) => node.props.testID === 'calendar-day-skeleton')
    expect(skeletons.length).toBeGreaterThanOrEqual(35)
    expect(skeletons[0]?.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 44, height: 44 })]),
    )
    expect(tree.root.findAll((node) => String(node.props.testID).startsWith('day-cell-'))).toHaveLength(0)
  })
})
