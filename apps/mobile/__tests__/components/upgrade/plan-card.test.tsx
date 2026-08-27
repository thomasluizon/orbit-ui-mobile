import { describe, expect, it, vi } from 'vitest'
import { createElement, type ComponentProps } from 'react'

import { PlanCard } from '@/components/upgrade/plan-card'

const TestRenderer = require('react-test-renderer')

function renderPlan(props: Partial<ComponentProps<typeof PlanCard>> = {}) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <PlanCard
        name="Anual"
        price="R$ 79,90"
        selected={false}
        onClick={() => {}}
        {...props}
      />,
    )
  })
  return tree
}

describe('PlanCard (mobile)', () => {
  it('renders name, badge, and price', () => {
    const tree = renderPlan({
      badge: createElement('BadgeNode'),
    })
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toEqual(
      expect.arrayContaining([
        'Anual',
        'R$ 79,90',
      ]),
    )
  })

  it('fires onClick when pressed', () => {
    const onClick = vi.fn()
    const tree = renderPlan({ onClick })
    const card = tree.root.findByType('Pressable')
    expect(card.props.accessibilityRole).toBe('radio')
    TestRenderer.act(() => {
      card.props.onPress()
    })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('exposes the selected state', () => {
    const unselected = renderPlan()
    expect(unselected.root.findByType('Pressable').props.accessibilityState).toEqual({
      checked: false,
      disabled: false,
      busy: false,
    })

    const selected = renderPlan({ selected: true })
    expect(selected.root.findByType('Pressable').props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
      busy: false,
    })
  })

  it('blocks presses and exposes disabled and busy state while loading', () => {
    const onClick = vi.fn()
    const tree = renderPlan({ loading: true, onClick })
    const card = tree.root.findByType('Pressable')

    expect(card.props.disabled).toBe(true)
    expect(card.props.onPress).toBeUndefined()
    expect(card.props.accessibilityState).toEqual({
      checked: false,
      disabled: true,
      busy: true,
    })
    expect(onClick).not.toHaveBeenCalled()
  })
})
