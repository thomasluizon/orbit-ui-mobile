import React from 'react'
import { Pressable } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { DateField } from '@/components/ui/date-field'

/** The global setup stubs DateField away; this suite tests the real one. */
vi.unmock('@/components/ui/date-field')

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 0 } }),
}))

const TestRenderer = require('react-test-renderer')

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten))
  if (style && typeof style === 'object') return style as Record<string, unknown>
  return {}
}

function render(element: React.ReactElement) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function dayTargets(tree: any) {
  return tree.root
    .findAllByType(Pressable)
    .filter((node: any) => typeof node.props.accessibilityState?.selected === 'boolean')
}

describe('DateField (mobile)', () => {
  it('gives every day control a 44 by 44 target around its 36px circle', () => {
    const tree = render(<DateField value="2025-06-15" onChange={vi.fn()} />)

    const [trigger] = tree.root.findAllByType(Pressable)
    TestRenderer.act(() => {
      trigger.props.onPress()
    })

    const targets = dayTargets(tree)
    expect(targets.length).toBeGreaterThan(0)

    for (const target of targets) {
      const targetStyle = flatten(
        typeof target.props.style === 'function'
          ? target.props.style({ pressed: false })
          : target.props.style,
      )
      expect(targetStyle.width).toBe(44)
      expect(targetStyle.height).toBe(44)

      const circle = target.props.children
      const circleStyle = flatten(circle.props.style)
      expect(circleStyle.width).toBe(36)
      expect(circleStyle.height).toBe(36)
    }
  })

  it('reports the picked day as a canonical date', () => {
    const onChange = vi.fn()
    const tree = render(<DateField value="2025-06-15" onChange={onChange} />)

    const [trigger] = tree.root.findAllByType(Pressable)
    TestRenderer.act(() => {
      trigger.props.onPress()
    })

    const targets = dayTargets(tree)
    TestRenderer.act(() => {
      targets[10]!.props.onPress()
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
