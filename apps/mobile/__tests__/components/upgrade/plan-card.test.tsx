import { describe, expect, it, vi } from 'vitest'

import { PlanCard } from '@/components/upgrade/plan-card'

const TestRenderer = require('react-test-renderer')

function renderPlan(props: Partial<React.ComponentProps<typeof PlanCard>> = {}) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(
      <PlanCard
        name="Anual"
        price="R$ 79,90"
        selected={false}
        onSelect={() => {}}
        {...props}
      />,
    )
  })
  return tree
}

describe('PlanCard (mobile)', () => {
  it('renders name, badge, price, sub, and features', () => {
    const tree = renderPlan({
      badge: 'Economize 20%',
      sub: 'por ano',
      features: ['Astra ilimitada', 'Widgets'],
    })
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toEqual(
      expect.arrayContaining([
        'Anual',
        'Economize 20%',
        'R$ 79,90',
        'por ano',
        'Astra ilimitada',
        'Widgets',
      ]),
    )
  })

  it('fires onSelect when pressed', () => {
    const onSelect = vi.fn()
    const tree = renderPlan({ onSelect })
    const card = tree.root.findByType('Pressable')
    expect(card.props.accessibilityRole).toBe('radio')
    TestRenderer.act(() => {
      card.props.onPress()
    })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('exposes the selected state', () => {
    const unselected = renderPlan()
    expect(unselected.root.findByType('Pressable').props.accessibilityState).toEqual({
      checked: false,
    })

    const selected = renderPlan({ selected: true })
    expect(selected.root.findByType('Pressable').props.accessibilityState).toEqual({
      checked: true,
    })
  })
})
