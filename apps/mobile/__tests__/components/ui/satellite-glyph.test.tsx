import { describe, expect, it } from 'vitest'

import { SatelliteGlyph } from '@/components/ui/satellite-glyph'

const TestRenderer = require('react-test-renderer')

describe('SatelliteGlyph (mobile)', () => {
  it('renders the satellite svg with default size 96', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<SatelliteGlyph />)
    })
    const svg = tree.root.findByType('Svg')
    expect(svg.props.width).toBe(96)
    expect(svg.props.height).toBe(96)
    expect(tree.root.findAllByType('Circle')).toHaveLength(4)
  })

  it('respects the size prop', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<SatelliteGlyph size={48} />)
    })
    expect(tree.root.findByType('Svg').props.width).toBe(48)
  })
})
