import type { ReactElement } from 'react'
import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { CalendarStats } from '@/app/(tabs)/calendar/_components/calendar-stats'
import { StatTile } from '@/components/ui/stat-tile'
import { createTokensV2, radius } from '@/lib/theme'

vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))

const TestRenderer = require('react-test-renderer')
const tokens = createTokensV2('purple', 'dark')

type Node = { type: unknown; props: Record<string, any>; findAll(predicate: (node: Node) => boolean): Node[] }

const stats = [
  { key: 'bestStreak', value: 5, label: 'Best' },
  { key: 'totalLogs', value: 12, label: 'Logged' },
  { key: 'missed', value: 3, label: 'Not logged' },
] as const

function render(element: ReactElement): { root: Node; unmount(): void } {
  let tree: { root: Node; unmount(): void } | undefined
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree!
}

function backgrounds(root: Node) {
  return root.findAll((node) => typeof node.type === 'string' && StyleSheet.flatten(node.props.style)?.backgroundColor !== undefined)
    .map((node) => StyleSheet.flatten(node.props.style))
}

function expectSkeletonBlocks(root: Node, count: number) {
  const units = root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'skeleton-unit-fill')
  expect(units).toHaveLength(count)
  for (const unit of units) expect(unit.props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' })
  const blocks = backgrounds(root).filter((style) => style.backgroundColor === tokens.bgWell)
  expect(blocks).toHaveLength(count)
  for (const block of blocks) expect(block.borderRadius).toBe(radius.md)
  expect(backgrounds(root).some((style) => style.backgroundColor === tokens.bgElev2 || style.backgroundColor === tokens.bgElev)).toBe(false)
}

describe('a loading figure draws its placeholder from the Skeleton blocks on Android', () => {
  it('fills the stat tile value and caption with the skeleton block and keeps one named busy region', () => {
    const tree = render(<StatTile state="loading" loadingLabel="Loading" label="Logged" />)
    const tile = tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'stat-tile-loading')[0]!
    expect(tile.props).toMatchObject({ accessibilityRole: 'progressbar', accessibilityLabel: 'Loading' })
    expectSkeletonBlocks(tree.root, 2)
    tree.unmount()
  })

  it('fills each calendar figure value with the skeleton block', () => {
    const tree = render(<CalendarStats stats={stats} state="loading" loadingLabel="Loading" />)
    expect(tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'progressbar' && node.props.accessibilityLabel === 'Loading')).toHaveLength(3)
    expectSkeletonBlocks(tree.root, 3)
    tree.unmount()
  })
})
