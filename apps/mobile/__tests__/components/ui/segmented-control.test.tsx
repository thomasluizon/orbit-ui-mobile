import { describe, expect, it, vi } from 'vitest'
import type { ReactTestRenderer } from 'react-test-renderer'
import { SegmentedControl } from '@/components/ui/segmented-control'

const TestRenderer = require('react-test-renderer') as typeof import('react-test-renderer')

function findByTestId(tree: ReactTestRenderer, testID: string) {
  return tree.root.findAll((node) => node.props.testID === testID)[0] as
    | { props: { onPress?: () => void } }
    | undefined
}

describe('SegmentedControl (mobile)', () => {
  it('changes only when another view is pressed', () => {
    const onChange = vi.fn()
    let tree: ReactTestRenderer | undefined
    void TestRenderer.act(() => {
      tree = TestRenderer.create(
        <SegmentedControl
          options={[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
          ]}
          value="all"
          onChange={onChange}
          label="Goal views"
        />,
      )
    })

    void TestRenderer.act(() => {
      const onPress = tree ? findByTestId(tree, 'segment-all')?.props.onPress : undefined
      if (typeof onPress === 'function') onPress()
    })
    expect(onChange).not.toHaveBeenCalled()
    void TestRenderer.act(() => {
      const onPress = tree ? findByTestId(tree, 'segment-active')?.props.onPress : undefined
      if (typeof onPress === 'function') onPress()
    })
    expect(onChange).toHaveBeenCalledWith('active')
  })
})
