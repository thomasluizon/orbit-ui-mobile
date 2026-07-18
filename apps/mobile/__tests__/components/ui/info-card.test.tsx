import React from 'react'
import { describe, expect, it } from 'vitest'

import { InfoCard } from '@/components/ui/info-card'

const TestRenderer = require('react-test-renderer')

function renderCard(element: React.ReactElement) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

describe('InfoCard (mobile)', () => {
  it('renders title and description', () => {
    const tree = renderCard(<InfoCard title="Astra" desc="Sua assistente de hábitos" />)
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toEqual(expect.arrayContaining(['Astra', 'Sua assistente de hábitos']))
  })

  it('renders the default info icon', () => {
    const tree = renderCard(<InfoCard title="Astra" />)
    expect(tree.root.findAllByType('IconInfoCircle')).toHaveLength(1)
  })

  it('renders a trailing slot', () => {
    const tree = renderCard(
      <InfoCard title="Astra" trailing={React.createElement('TrailingNode')} />,
    )
    expect(tree.root.findAllByType('TrailingNode')).toHaveLength(1)
  })
})
