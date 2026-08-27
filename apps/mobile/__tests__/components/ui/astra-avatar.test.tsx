import { describe, expect, it } from 'vitest'

import { AstraMark, AstraAvatar } from '@/components/ui/astra-avatar'

const TestRenderer = require('react-test-renderer')

describe('AstraMark (mobile)', () => {
  it('renders the Astra asset with default size 24', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<AstraMark />)
    })
    const svg = tree.root.findByType('Svg')
    expect(svg.props.width).toBe(24)
    expect(svg.props.height).toBe(24)
    expect(svg.props.testID).toBe('astra-mark')
  })

  it('respects the size prop', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<AstraMark size={40} />)
    })
    expect(tree.root.findByType('Svg').props.width).toBe(40)
  })

  it('uses the native redraw below 20px', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<AstraMark size={16} />)
    })
    expect(tree.root.findByType('Svg').props.testID).toBe('astra-mark-16')
  })

  it('renders monochrome when a color is given', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<AstraMark color="#abcdef" />)
    })
    expect(tree.root.findByType('Svg').props.color).toBe('#abcdef')
  })
})

describe('AstraAvatar (mobile)', () => {
  it('renders the mark on a disc', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<AstraAvatar size={116} />)
    })
    expect(tree.root.findByType('Svg')).toBeDefined()
  })

  it('exposes an accessibility label when provided', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<AstraAvatar label="Astra avatar" />)
    })
    expect(tree.root.findByProps({ accessibilityLabel: 'Astra avatar' })).toBeDefined()
  })
})
