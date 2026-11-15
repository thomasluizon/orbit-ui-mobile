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
  return settle(width, height)
}

function boxesOf(width: number, height: number) {
  const hosts = new Map<string, GeometryHost>()
  const boxes = measureSafeArea(tree.toJSON(), (host) => {
    if (typeof host.props.testID === 'string') hosts.set(host.props.testID, host)
    return host.props.testID
  }, { width, height })
  return { boxes, hosts }
}

/** Hands the measured heights to the layout handlers, as the native layout pass does, then measures again. */
async function settle(width: number, height: number) {
  const { boxes } = boxesOf(width, height)
  await act(() => {
    for (const id of ['search-scroller', 'search-orbit', 'search-question']) {
      const box = boxes.get(id)!
      const host = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props.testID === id)[0]!
      ;(host.props.onLayout as (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void)({ nativeEvent: { layout: { x: box.left, y: box.top, width: box.width, height: box.bottom - box.top } } })
    }
  })
  return read(width, height)
}

function read(width: number, height: number) {
  const { boxes, hosts } = boxesOf(width, height)
  const padding = StyleSheet.flatten(hosts.get('search-scroller')!.props.contentContainerStyle)
  const viewport = boxes.get('search-scroller')!
  return {
    free: { top: viewport.top + Number(padding.paddingTop), bottom: boxes.get('tab-bar')!.top - Number(padding.paddingBottom) },
    block: { top: boxes.get('search-orbit')!.top, bottom: boxes.get('search-question')!.bottom },
    rows: boxes.get('search-rows')!,
    question: boxes.get('search-question')!,
    scrollerBottom: viewport.bottom,
    tabBarTop: boxes.get('tab-bar')!.top,
  }
}

describe('the Android search block before a query', () => {
  it.each([320, 360, 384, 412])('sits in the centre of the free area at %i px wide, with the rows under it', async (width) => {
    search.habits = 0
    const { free, block, rows, question, scrollerBottom, tabBarTop } = await measure(width, 1600)
    expect(scrollerBottom).toBe(tabBarTop)
    expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
    expect(rows.top).toBeGreaterThanOrEqual(block.bottom)
    expect(question.left).toBeGreaterThanOrEqual(0)
    expect(question.left + question.width).toBeLessThanOrEqual(width)
  })

  it.each([320, 412])('keeps the block in the centre at %i px wide while the rows run past the free area and scroll', async (width) => {
    search.habits = 12
    const { free, block, rows } = await measure(width, 915)
    expect(rows.bottom).toBeGreaterThan(free.bottom)
    expect(Math.abs((block.top + block.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
  })

  it('aligns the block under the header when it is taller than the free area', async () => {
    search.habits = 0
    const { free, block } = await measure(320, 300)
    expect(block.bottom - block.top).toBeGreaterThan(free.bottom - free.top)
    expect(block.top).toBe(free.top)
  })

  it('aligns under the header while the keyboard is open', async () => {
    search.habits = 0
    await measure(412, 1600)
    await act(() => { __emitKeyboardEvent('keyboardDidShow') })
    const { free, block } = await settle(412, 1600)
    expect(block.top).toBe(free.top)
    await act(() => { __emitKeyboardEvent('keyboardDidHide') })
  })
})
