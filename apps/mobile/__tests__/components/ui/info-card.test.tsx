import React from 'react'
import { describe, expect, it } from 'vitest'
import { Text } from 'react-native'

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
    const tree = renderCard(<InfoCard><Text>Astra</Text><Text>Sua assistente de hábitos</Text></InfoCard>)
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts).toEqual(expect.arrayContaining(['Astra', 'Sua assistente de hábitos']))
  })

  it('renders without an icon', () => {
    const tree = renderCard(<InfoCard><Text>Astra</Text></InfoCard>)
    expect(tree.root.findAllByType('Text')).toHaveLength(1)
  })

  it('renders a trailing slot', () => {
    const tree = renderCard(
      <InfoCard icon={React.createElement('LeadingNode')}>
        {React.createElement('TrailingNode')}
      </InfoCard>,
    )
    expect(tree.root.findAllByType('TrailingNode')).toHaveLength(1)
  })
})
