import { describe, expect, it } from 'vitest'

import { Badge } from '@/components/ui/badge'

const TestRenderer = require('react-test-renderer')

function renderBadge(variant: 'solid' | 'outline' = 'solid') {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<Badge variant={variant}>premium</Badge>)
  })
  return tree
}

describe('Badge (mobile)', () => {
  it('renders its children', () => {
    const tree = renderBadge()
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toContain('premium')
  })

  it.each(['solid', 'outline'] as const)('renders the %s variant at chip radius', (variant) => {
    const tree = renderBadge(variant)
    const view = tree.root.findByType('View')
    expect(view.props.style[0].borderRadius).toBe(8)
  })
})
