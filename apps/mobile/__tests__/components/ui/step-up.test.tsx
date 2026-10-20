import { describe, expect, it, vi } from 'vitest'
import { StepUp } from '@/components/ui/step-up'

const TestRenderer = require('react-test-renderer')

describe('StepUp (mobile)', () => {
  it('renders one handoff action and no text input', () => {
    const onAction = vi.fn()
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <StepUp message="Sign in again to continue." actionLabel="Sign in" onAction={onAction} />,
      )
    })

    expect(tree.root.findAllByType('TextInput')).toHaveLength(0)
    const button = tree.root.find((node: any) => node.props.testID === 'button-secondary-sm')
    TestRenderer.act(() => button.props.onPress())
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})
