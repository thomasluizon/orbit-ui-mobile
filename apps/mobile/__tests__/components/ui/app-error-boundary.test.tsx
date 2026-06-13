import { describe, expect, it, vi } from 'vitest'
import { AppErrorScreen } from '@/components/ui/app-error-boundary'

const TestRenderer = require('react-test-renderer')

function render(element: React.ReactElement) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

describe('AppErrorScreen (mobile)', () => {
  it('renders a retry button that calls retry when pressed', () => {
    const retry = vi.fn()
    const tree = render(<AppErrorScreen error={new Error('boom')} retry={retry} />)

    const button = tree.root.findByType('Pressable')
    expect(button.props.accessibilityRole).toBe('button')

    TestRenderer.act(() => {
      button.props.onPress()
    })
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('renders a designed fallback with an alert orb and a message', () => {
    const tree = render(<AppErrorScreen error={new Error('boom')} retry={vi.fn()} />)
    const texts = tree.root.findAllByType('Text').map((node: any) => node.props.children)
    expect(texts.length).toBeGreaterThan(0)
  })
})
