import { describe, expect, it } from 'vitest'

import { AstraMark, AstraAvatar } from '@/components/ui/astra-avatar'

const TestRenderer = require('react-test-renderer')

describe('AstraMark (mobile)', () => {
  it('renders the orbital svg with default size 24', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<AstraMark />)
    })
    const svg = tree.root.findByType('Svg')
    expect(svg.props.width).toBe(24)
    expect(svg.props.height).toBe(24)
    expect(tree.root.findAllByType('Circle')).toHaveLength(3)
    expect(tree.root.findAllByType('Path')).toHaveLength(1)
  })

  it('respects the size prop', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<AstraMark size={40} />)
    })
    expect(tree.root.findByType('Svg').props.width).toBe(40)
  })

  it('keeps the ring strokeable and unfilled in the duotone default', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<AstraMark />)
    })
    const ring = tree.root
      .findAllByType('Circle')
      .find((node: { props: { stroke?: string; fill?: string } }) => node.props.stroke != null)
    expect(ring).toBeDefined()
    expect(ring.props.fill).toBeUndefined()
  })

  it('renders monochrome when a color is given', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<AstraMark color="#abcdef" />)
    })
    const ring = tree.root
      .findAllByType('Circle')
      .find((node: { props: { stroke?: string } }) => node.props.stroke != null)
    expect(ring.props.stroke).toBe('#abcdef')
  })
})

describe('AstraAvatar (mobile)', () => {
  it('renders the mark on a disc', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<AstraAvatar size={116} />)
    })
    expect(tree.root.findByType('Svg')).toBeDefined()
  })

  it('exposes an accessibility label when provided', async () => {
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<AstraAvatar label="Astra avatar" />)
    })
    expect(tree.root.findByProps({ accessibilityLabel: 'Astra avatar' })).toBeDefined()
  })
})
