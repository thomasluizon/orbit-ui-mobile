import { describe, expect, it } from 'vitest'

import { Badge, type BadgeTone } from '@/components/ui/badge'

const TestRenderer = require('react-test-renderer')

function renderBadge(tone?: BadgeTone) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<Badge tone={tone}>{tone ?? 'premium'}</Badge>)
  })
  return tree
}

describe('Badge (mobile)', () => {
  it('renders its children', () => {
    const tree = renderBadge()
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toContain('premium')
  })

  it.each<BadgeTone>(['violet', 'soft', 'outline', 'amber', 'bad'])('renders the %s tone', (tone) => {
    const tree = renderBadge(tone)
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toContain(tone)
  })
})
