import { describe, expect, it, vi } from 'vitest'

import { PillButton } from '@/components/ui/pill-button'

const TestRenderer = require('react-test-renderer')

function renderPill(element: React.ReactElement) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function textContents(tree: any): unknown[] {
  return tree.root.findAllByType('Text').map((node: any) => node.props.children)
}

describe('PillButton (mobile)', () => {
  it('renders its label', () => {
    const tree = renderPill(<PillButton onPress={() => {}}>Continue</PillButton>)
    expect(textContents(tree)).toContain('Continue')
  })

  it('fires onPress when pressed', () => {
    const onPress = vi.fn()
    const tree = renderPill(<PillButton onPress={onPress}>Continue</PillButton>)
    const button = tree.root.findByType('Pressable')
    expect(button.props.accessibilityRole).toBe('button')
    TestRenderer.act(() => {
      button.props.onPress()
    })
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('exposes the disabled state', () => {
    const tree = renderPill(
      <PillButton onPress={() => {}} disabled>
        Continue
      </PillButton>,
    )
    const button = tree.root.findByType('Pressable')
    expect(button.props.disabled).toBe(true)
    expect(button.props.accessibilityState).toEqual({ disabled: true })
  })

  it('renders white and ghost variants with a leading node', () => {
    const tree = renderPill(
      <>
        <PillButton variant="white" onPress={() => {}}>
          White
        </PillButton>
        <PillButton variant="ghost" onPress={() => {}} leading={<></>}>
          Ghost
        </PillButton>
      </>,
    )
    const labels = textContents(tree)
    expect(labels).toContain('White')
    expect(labels).toContain('Ghost')
  })
})
