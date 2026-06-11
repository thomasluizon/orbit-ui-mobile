import { describe, expect, it } from 'vitest'

import { StatTile } from '@/components/ui/stat-tile'

const TestRenderer = require('react-test-renderer')

describe('StatTile (mobile)', () => {
  it('renders emoji, value, and label', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<StatTile emoji="🔥" value="7 dias" label="Sequência" />)
    })
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toEqual(expect.arrayContaining(['🔥', '7 dias', 'Sequência']))
  })

  it('renders numeric values', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<StatTile emoji="⭐" value={12} label="Total" />)
    })
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toContain(12)
  })
})
