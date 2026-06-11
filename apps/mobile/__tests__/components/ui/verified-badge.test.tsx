import { describe, expect, it } from 'vitest'

import { VerifiedBadge } from '@/components/ui/verified-badge'

const TestRenderer = require('react-test-renderer')

describe('VerifiedBadge (mobile)', () => {
  it('renders the scalloped check paths inside the disc', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<VerifiedBadge />)
    })
    expect(tree.root.findAllByType('Path')).toHaveLength(2)
  })

  it('scales the inner check to half the disc size', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<VerifiedBadge size={64} />)
    })
    expect(tree.root.findByType('Svg').props.width).toBe(32)
  })
})
