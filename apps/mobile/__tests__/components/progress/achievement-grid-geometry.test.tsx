import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { StyleSheet, type ViewStyle } from 'react-native'
import Yoga from 'yoga-layout'
import { createMockAchievement, createMockGamificationProfile, createMockProfile } from '@orbit/shared/__tests__/factories'
import { SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import { ProgressContent } from '@/components/progress/progress-content'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'
import { __setWindowDimensions } from '../../../test-mocks/react-native'

const TestRenderer = require('react-test-renderer')
const achievements = ['first_orbit', 'liftoff', 'mission_control'].map((id, index) =>
  createMockAchievement({ id, isEarned: index === 0 }),
)
const profile = createMockGamificationProfile({ achievements, achievementsEarned: 1, achievementsTotal: 3 })

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({
  profile: createMockProfile({ hasProAccess: true, canViewGamification: true }),
  isLoading: false, isError: false,
}) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => ({ data: { allGoals: [] }, isLoading: false, isError: false }),
  useReorderGoals: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-gamification', () => ({
  useGamificationProfile: () => ({ profile, xpProgress: 50, isLoading: false, isError: false }),
  useStreakFreeze: () => ({ streakInfo: null, streakQuery: { isError: false }, isFrozenToday: false }),
  useRepairStreak: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-retrospective', () => ({ useProgressRetrospective: () => ({ isLoading: false, isError: false }) }))
vi.mock('@/components/navigation/root-notification-header', () => ({ RootNotificationHeader: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))
vi.mock('@/components/ui/confirm-sheet', () => ({ ConfirmSheet: () => null }))
vi.mock('@/components/ui/menu', () => ({ Menu: () => null }))

type TestNode = {
  type: unknown
  props: { testID?: string; style?: ViewStyle }
  parent: TestNode | null
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}
type TestTree = { root: TestNode; update: (element: React.ReactElement) => void; unmount: () => void }

afterEach(() => __setWindowDimensions({ width: 412, height: 915, scale: 1, fontScale: 1 }))

function measureGrid(tree: TestTree, rowWidth: number) {
  const tiles = () => tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID?.startsWith('achievement-tile-') === true)
  let grid = tiles()[0]!.parent!
  while (typeof grid.type !== 'string') grid = grid.parent!
  const config = Yoga.Config.create()
  config.setPointScaleFactor(0)
  const row = Yoga.Node.createWithConfig(config)
  const style = StyleSheet.flatten(grid.props.style)
  row.setWidth(rowWidth)
  row.setFlexDirection(style.flexDirection === 'row' ? Yoga.FLEX_DIRECTION_ROW : Yoga.FLEX_DIRECTION_COLUMN)
  row.setFlexWrap(style.flexWrap === 'wrap' ? Yoga.WRAP_WRAP : Yoga.WRAP_NO_WRAP)
  row.setGap(Yoga.GUTTER_ALL, Number(style.gap ?? 0))
  const nodes = tiles().map((tile, index) => {
    const tileStyle = StyleSheet.flatten(tile.props.style)
    const node = Yoga.Node.createWithConfig(config)
    if (typeof tileStyle.width === 'number') node.setWidth(tileStyle.width)
    else if (typeof tileStyle.width === 'string' && tileStyle.width.endsWith('%')) node.setWidthPercent(Number.parseFloat(tileStyle.width))
    node.setMinWidth(typeof tileStyle.minWidth === 'number' ? tileStyle.minWidth : undefined)
    node.setMinHeight(index === 0 ? 140 : 100)
    row.insertChild(node, index)
    return node
  })
  try {
    row.calculateLayout(undefined, undefined, Yoga.DIRECTION_LTR)
    return nodes.map((node) => ({ left: node.getComputedLeft(), top: node.getComputedTop(), width: node.getComputedWidth(), height: node.getComputedHeight() }))
  } finally { row.freeRecursive(); config.free() }
}

it.each([412, 600, 840, 1352, 1600])('aligns three achievement tiles to the content edges at %ipx', async (width) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  let tree!: TestTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<ProgressContent />) })
  try {
    const rowWidth = Math.min(width, SHELL_CONTENT_MAX_WIDTH) - 32
    const tiles = measureGrid(tree, rowWidth)
    expect(tiles).toHaveLength(3)
    expect(tiles[0]!.left).toBe(0)
    for (const tile of tiles) expect(Math.abs(tile.width - tiles[0]!.width)).toBeLessThanOrEqual(0.5)
    if (width >= 600) {
      expect(tiles[1]!.top).toBe(tiles[0]!.top)
      expect(tiles[1]!.height).toBe(tiles[0]!.height)
      expect(tiles[1]!.left - tiles[0]!.left - tiles[0]!.width).toBe(12)
      expect(Math.abs(tiles[1]!.left + tiles[1]!.width - rowWidth), 'the full row must end on the content edge').toBeLessThanOrEqual(0.5)
      expect(tiles[2]!.left).toBe(0)
      expect(tiles[2]!.top - tiles[0]!.top - tiles[0]!.height).toBe(12)
    } else {
      for (const [index, tile] of tiles.entries()) {
        expect(tile.left).toBe(0)
        expect(Math.abs(tile.width - rowWidth)).toBeLessThanOrEqual(0.5)
        if (index) expect(tile.top - tiles[index - 1]!.top - tiles[index - 1]!.height).toBe(12)
      }
    }
  } finally { await TestRenderer.act(() => tree.unmount()) }
})

it('recalculates columns when the Android window resizes', async () => {
  let tree!: TestTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<ProgressContent />) })
  try {
    for (const width of [840, 412, 600, 1352]) {
      await TestRenderer.act(() => {
        __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
        tree.update(<ProgressContent />)
      })
      const rowWidth = Math.min(width, SHELL_CONTENT_MAX_WIDTH) - 32
      const tiles = measureGrid(tree, rowWidth)
      expect(new Set(tiles.map((tile) => tile.left)).size).toBe(width === 412 ? 1 : 2)
    }
  } finally { await TestRenderer.act(() => tree.unmount()) }
})

it.each([412, 1200, 1600])('uses the whole column for the progress summary at %ipx', async (width) => {
  let tree!: GeometryTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<ProgressContent />) as GeometryTree })
  try {
    const columnWidth = Math.min(width, SHELL_CONTENT_MAX_WIDTH)
    const boxes = measureSafeArea(tree.toJSON(), (host) => host.props.testID, { width: columnWidth, height: 915 })
    expect(boxes.get('progress-xp-summary')!.width).toBe(columnWidth - 32)
  } finally { await TestRenderer.act(() => tree.unmount()) }
})

it.each([1200, 1600])('keeps a single achievement at the grid track width at %ipx', async (width) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  profile.achievements = achievements.slice(0, 1)
  let tree!: TestTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<ProgressContent />) })
  try {
    const rowWidth = SHELL_CONTENT_MAX_WIDTH - 32
    const tiles = measureGrid(tree, rowWidth)
    expect(tiles[0]!.width).toBe((rowWidth - 12) / 2)
  } finally {
    profile.achievements = achievements
    await TestRenderer.act(() => tree.unmount())
  }
})

it.each([412, 840, 1352])('renders the achievement columns before layout events at %ipx', async (width) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  let tree!: TestTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<ProgressContent />) })
  try {
    const tiles = measureGrid(tree, Math.min(width, SHELL_CONTENT_MAX_WIDTH) - 32)
    expect(new Set(tiles.map((tile) => tile.left)).size).toBe(width === 412 ? 1 : 2)
  } finally { await TestRenderer.act(() => tree.unmount()) }
})

it.each([412, 840, 1352])('uses one readable achievement track at 200 percent text at %ipx', async (width) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 2 })
  let tree!: TestTree
  await TestRenderer.act(() => { tree = TestRenderer.create(<ProgressContent />) })
  try {
    const tiles = measureGrid(tree, Math.min(width, SHELL_CONTENT_MAX_WIDTH) - 32)
    expect(new Set(tiles.map((tile) => tile.left)).size).toBe(1)
    expect(tiles[0]!.width).toBe(Math.min(width, SHELL_CONTENT_MAX_WIDTH) - 32)
  } finally { await TestRenderer.act(() => tree.unmount()) }
})
