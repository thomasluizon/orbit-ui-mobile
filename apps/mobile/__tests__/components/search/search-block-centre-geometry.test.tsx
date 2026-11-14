import React from 'react'
import { StyleSheet, View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { enableTestFlags } from '@orbit/shared/test-support/flag-state'
import SearchScreen from '@/app/search'
import { Shell412 } from '@/components/shell/shell-412'
import { measureSafeArea, type GeometryHost, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __emitKeyboardEvent, __setWindowDimensions } from '@/test-mocks/react-native'

const search = vi.hoisted(() => ({ habits: 0 }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-native-safe-area-context', async (original) => ({
  ...await original<typeof import('react-native-safe-area-context')>(),
  SafeAreaView: (await import('react-native')).View,
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => '/search' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC' } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/hooks/use-habit-logging', () => ({ useLogHabit: () => ({ mutate: vi.fn(), isPending: false }), useSkipHabit: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useSearchHabits: () => {
  const habits = Array.from({ length: search.habits }, (_, index) => createMockHabit({ id: `habit-${index}`, title: `Habit ${index}` }))
  return { data: { topLevelHabits: habits, habitsById: new Map(habits.map((habit) => [habit.id, habit])), childrenByParent: new Map(), totalCount: habits.length, totalPages: 1, currentPage: 1 }, isPending: false, isFetching: false, isSuccess: true, isError: false, refetch: vi.fn() }
} }))

let tree: GeometryTree
beforeEach(() => enableTestFlags('orbit_guided_flows'))
afterEach(async () => { await act(() => tree.unmount()) })

async function measure(width: number, height: number) {
  __setWindowDimensions({ width, height, scale: 1, fontScale: 1 })
  await act(() => { tree = create(<Shell412 safeAreaTop={false} notice={<></>} tabBar={<View testID="tab-bar" style={{ height: 80 }} />}>
    <SearchScreen />
  </Shell412>) as GeometryTree })
  return read(width, height)
}

function read(width: number, height: number) {
  let scroller: GeometryHost | undefined
  const boxes = measureSafeArea(tree.toJSON(), (host) => {
    if (host.props.testID === 'search-scroller') scroller = host
    return host.props.testID
  }, { width, height })
  const padding = StyleSheet.flatten(scroller!.props.contentContainerStyle)
  const viewport = boxes.get('search-scroller')!
  return {
    free: { top: viewport.top + Number(padding.paddingTop), bottom: boxes.get('tab-bar')!.top - Number(padding.paddingBottom) },
    group: { top: boxes.get('search-orbit')!.top, bottom: boxes.get('search-rows')!.bottom },
    question: boxes.get('search-question')!,
    scrollerBottom: viewport.bottom,
    tabBarTop: boxes.get('tab-bar')!.top,
  }
}

describe('the Android search group before a query', () => {
  it.each([320, 360, 384, 412])('sits in the centre of the free area at %i px wide when the group fits', async (width) => {
    search.habits = 0
    const { free, group, question, scrollerBottom, tabBarTop } = await measure(width, 1600)
    expect(scrollerBottom).toBe(tabBarTop)
    expect(free.bottom - free.top).toBeGreaterThan(group.bottom - group.top)
    expect(Math.abs((group.top + group.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
    expect(question.left).toBeGreaterThanOrEqual(0)
    expect(question.left + question.width).toBeLessThanOrEqual(width)
  })

  it.each([320, 412])('aligns under the header and scrolls at %i px wide when the group is taller than the free area', async (width) => {
    search.habits = 12
    const { free, group } = await measure(width, 915)
    expect(group.bottom - group.top).toBeGreaterThan(free.bottom - free.top)
    expect(group.top).toBe(free.top)
  })

  it('aligns under the header while the keyboard is open, also when the group fits', async () => {
    search.habits = 0
    await measure(412, 1600)
    await act(() => { __emitKeyboardEvent('keyboardDidShow') })
    const { free, group } = read(412, 1600)
    expect(group.top).toBe(free.top)
    await act(() => { __emitKeyboardEvent('keyboardDidHide') })
  })
})
