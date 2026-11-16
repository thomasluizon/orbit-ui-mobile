import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { createTokensV2 } from '@/lib/theme'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'

const TestRenderer = require('react-test-renderer')

vi.mock('@/lib/motion', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/motion')>()
  return { ...original, usePrefersReducedMotion: () => true }
})

function render(element: React.ReactNode) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function textValues(tree: any): string[] {
  return tree.root
    .findAllByType('Text')
    .flatMap((node: any) => (Array.isArray(node.props.children) ? node.props.children : [node.props.children]))
    .filter((value: unknown): value is string => typeof value === 'string')
}

describe('mobile feedback primitives', () => {
  it('exposes a skeleton label and busy state without hiding it', () => {
    const tree = render(<Skeleton variant="habit-row" label="Loading habits" />)
    const unit = tree.root.findByProps({ testID: 'skeleton-unit-habit-row' })

    expect(unit.props.accessibilityLabel).toBe('Loading habits')
    expect(unit.props.accessibilityRole).toBe('progressbar')
    expect(unit.props.accessibilityState).toEqual({ busy: true })
    expect(unit.props.accessibilityElementsHidden).toBeUndefined()
  })

  it('renders every cell in a multirow grid at the requested dimensions', () => {
    const tree = render(
      <Skeleton variant="grid" label="Loading calendar" rows={3} cols={7} cell={40} gap={8} />,
    )
    const grid = tree.root.findByProps({ testID: 'skeleton-grid-shape' })
    const blocks = grid.findAllByType('AnimatedView')

    expect(blocks).toHaveLength(21)
    expect(JSON.stringify(grid.props.style)).toContain('"gap":8')
    expect(JSON.stringify(grid.props.style)).toContain('"width":328')
    expect(JSON.stringify(grid.props.style)).toContain('"height":136')
    expect(JSON.stringify(blocks[0].props.style)).toContain('"width":40')
    expect(JSON.stringify(blocks[0].props.style)).toContain('"height":40')
  })

  it('keeps the reduced-motion skeleton at full size and adds no sweep', () => {
    const tree = render(<Skeleton variant="stat-tile" label="Loading stats" />)
    const output = JSON.stringify(tree.toJSON())

    expect(output).not.toContain('minHeight')
    const blocks = tree.root.findAllByType('AnimatedView')
    expect(blocks).toHaveLength(2)
    for (const block of blocks) {
      expect(StyleSheet.flatten(block.props.style).opacity.value).toBe(1)
    }
    expect(output).not.toMatch(/gradient|shimmer|sweep|spinner/i)
  })

  it('keeps the statistic placeholder at the loaded tile height', () => {
    const placeholderTree = render(<Skeleton variant="stat-tile" label="Loading stats" />)
    const loadedTree = render(<StatTile value={12} label="Logs" />)
    const placeholder = placeholderTree.root.findByProps({ testID: 'skeleton-stat-tile-shape' })
    const loaded = loadedTree.root.findByProps({ testID: 'stat-tile-default' })

    expect(StyleSheet.flatten(placeholder.props.style).minHeight)
      .toBe(StyleSheet.flatten(loaded.props.style).minHeight)
  })

  it('draws one mascot at 96 in an empty state', () => {
    const orbit = render(<EmptyState title="Nothing here" />)
    expect(orbit.root.findByProps({ testID: 'empty-state-mark' })).toBeTruthy()
    expect(orbit.root.findByType(OrbitMascot).props.size).toBe(96)
    expect(textValues(orbit)).toContain('Nothing here')
  })

  it('renders exactly one empty-state action', () => {
    const onAction = vi.fn()
    const tree = render(
      <EmptyState
        title="Nothing here"
        action={<Pressable accessibilityRole="button" onPress={onAction} />}
      />,
    )

    const actions = tree.root.findAll(
      (node: any) => node.type === Pressable && node.props.accessibilityRole === 'button',
    )
    expect(actions).toHaveLength(1)
    TestRenderer.act(() => actions[0].props.onPress())
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('renders an error message verbatim and only the supplied action', () => {
    const tree = render(
      <ErrorState
        message="Check the connection and try again."
        action={<Pressable accessibilityRole="button" />}
      />,
    )

    expect(textValues(tree)).toContain('Check the connection and try again.')
    const container = tree.root.findByProps({ testID: 'error-state' })
    expect(container.props.accessible).toBeUndefined()
    const error = tree.root.findByProps({ accessibilityRole: 'alert' })
    expect(error).not.toBe(container)
    expect(error.props.accessibilityLiveRegion).toBe('polite')
    expect(error.props.accessibilityLabel).toBe('Check the connection and try again.')
    expect(tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityRole === 'button')).toHaveLength(1)
  })

  it('renders capacity body separately and omits it when absent', () => {
    const withBody = render(
      <CapacityNotice message="Five messages today." body="Try again tomorrow." />,
    )
    expect(textValues(withBody)).toEqual(
      expect.arrayContaining(['Five messages today.', 'Try again tomorrow.']),
    )

    const withoutBody = render(<CapacityNotice message="Five messages today." />)
    expect(textValues(withoutBody)).toEqual(['Five messages today.'])
  })

  it('keeps capacity neutral and renders no second control', () => {
    const tree = render(
      <CapacityNotice
        message="Five messages today."
        action={<Pressable accessibilityRole="button" />}
      />,
    )
    const output = JSON.stringify(tree.toJSON())

    expect(output).not.toContain('statusBad')
    expect(tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityRole === 'button')).toHaveLength(1)
  })

  it('draws no mascot in an inline error, and Orbit in Parado above a full-surface error at 96 and 128', () => {
    expect(render(<ErrorState message="Try again." />).root.findAllByType(OrbitMascot)).toHaveLength(0)
    for (const [width, size] of [[412, 96], [1024, 128]] as const) {
      __setWindowDimensions({ width, height: 892, scale: 1, fontScale: 1 })
      const tree = render(<ErrorState fullSurface message="Check the connection and try again." action={<Pressable accessibilityRole="button" accessibilityLabel="Retry" />} />)
      const mascot = tree.root.findByType(OrbitMascot)
      expect(mascot.props).toMatchObject({ size })
      expect(mascot.props.state ?? 'parado').toBe('parado')
      expect(textValues(tree)).toEqual(['Check the connection and try again.'])
      expect(tree.root.findByProps({ testID: 'error-state-action' })).toBeTruthy()
    }
    __resetTestHostConfig()
  })

  it('rests Orbit at 48 beside the reason only where the AI is the missing part, with neutral tokens', () => {
    expect(render(<CapacityNotice message="Ten habits per goal." />).root.findAllByType(OrbitMascot)).toHaveLength(0)
    const tree = render(<CapacityNotice message="Five messages today." mascotState="descansando" />)
    expect(tree.root.findByType(OrbitMascot).props).toMatchObject({ size: 48, state: 'descansando' })
    expect(textValues(tree)).toEqual(['Five messages today.'])
    expect(JSON.stringify(tree.toJSON())).not.toContain(createTokensV2('orange', 'dark').statusBad)
  })
})
