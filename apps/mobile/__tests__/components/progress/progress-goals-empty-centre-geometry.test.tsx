import React from 'react'
import { View } from 'react-native'
import { act, create } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { ProgressContent } from '@/components/progress/progress-content'
import { Shell412 } from '@/components/shell/shell-412'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('react-native-safe-area-context', async (original) => ({
  ...await original<typeof import('react-native-safe-area-context')>(),
  SafeAreaView: (await import('react-native')).View,
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ hasProAccess: true }), isLoading: false, isError: false }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn(), dismissTo: vi.fn() }) }))
vi.mock('@/hooks/use-goals', () => ({
  useCreateGoal: vi.fn(),
  useGoals: () => ({ data: { allGoals: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useReorderGoals: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: () => null }))

const HEIGHT = 915
let tree: GeometryTree
afterEach(async () => { await act(() => tree.unmount()) })

it.each([360, 412, 840])('centres the Metas empty group between the header and the tab bar at %i px', async width => {
  __setWindowDimensions({ width, height: HEIGHT, scale: 1, fontScale: 1 })
  await act(() => { tree = create(<Shell412 safeAreaTop={false} notice={<></>} tabBar={<View testID="tab-bar" style={{ height: 80 }} />}>
    <ProgressContent screen="goals" />
  </Shell412>) as GeometryTree })
  const boxes = measureSafeArea(tree.toJSON(), host => host.props.testID, { width, height: HEIGHT })
  const free = { top: boxes.get('progress-goals-scroller')!.top, bottom: boxes.get('tab-bar')!.top }
  const group = boxes.get('empty-state')!
  expect(free.bottom - free.top).toBeGreaterThan(group.bottom - group.top)
  expect(Math.abs((group.top + group.bottom) / 2 - (free.top + free.bottom) / 2)).toBeLessThanOrEqual(1)
})
