import { describe, expect, it } from 'vitest'

import { AstraAvatar } from '@/components/ui/astra-avatar'

const TestRenderer = require('react-test-renderer')

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
