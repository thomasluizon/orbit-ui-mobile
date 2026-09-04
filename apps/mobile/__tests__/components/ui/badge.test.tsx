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
    const textNodes = tree.root.findAllByType('Text')
    const texts = textNodes.map((node: any) => node.props.children)
    expect(texts).toContain('premium')
    expect(textNodes[0].props.numberOfLines).toBe(1)
  })

  it.each(['solid', 'outline'] as const)('renders the %s variant at chip radius', (variant) => {
    const tree = renderBadge(variant)
    const view = tree.root.findByType('View')
    const text = tree.root.findByType('Text')
    expect(view.props.style[0].borderRadius).toBe(8)
    expect(text.props.style[0]).toMatchObject({
      fontFamily: 'GeistMono_500Medium',
      fontSize: 10.5,
      includeFontPadding: false,
      letterSpacing: 0.63,
      textTransform: 'uppercase',
    })
  })
})
