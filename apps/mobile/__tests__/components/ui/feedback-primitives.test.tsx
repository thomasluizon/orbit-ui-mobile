import React from 'react'
import { Pressable } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'

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
    expect(unit.props.accessibilityState).toEqual({ busy: true })
    expect(unit.props.accessibilityElementsHidden).toBeUndefined()
  })

  it('renders a seven-column grid at the requested dimensions', () => {
    const tree = render(
      <Skeleton variant="grid" label="Loading calendar" cols={7} cell={40} gap={8} />,
    )
    const grid = tree.root.findByProps({ testID: 'skeleton-grid-shape' })
    const blocks = grid.findAllByType('AnimatedView')

    expect(blocks).toHaveLength(7)
    expect(JSON.stringify(grid.props.style)).toContain('"gap":8')
    expect(JSON.stringify(blocks[0].props.style)).toContain('"width":40')
    expect(JSON.stringify(blocks[0].props.style)).toContain('"height":40')
  })

  it('keeps the reduced-motion skeleton at full size and adds no sweep', () => {
    const tree = render(<Skeleton variant="stat-tile" label="Loading stats" />)
    const output = JSON.stringify(tree.toJSON())

    expect(output).toContain('minHeight')
    expect(output).not.toMatch(/gradient|shimmer|sweep|spinner/i)
  })

  it('defaults an empty state to Orbit and switches to Astra', () => {
    const orbit = render(<EmptyState title="Nothing here" />)
    expect(orbit.root.findByProps({ testID: 'empty-state-mark-orbit' })).toBeTruthy()
    expect(textValues(orbit)).toContain('Nothing here')

    const astra = render(<EmptyState title="Ask Astra" mark="astra" />)
    expect(astra.root.findByProps({ testID: 'empty-state-mark-astra' })).toBeTruthy()
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
})
