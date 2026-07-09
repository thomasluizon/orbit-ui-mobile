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

function flattenStyle(style: any): Record<string, any> {
  if (Array.isArray(style)) {
    return style.reduce((acc, entry) => Object.assign(acc, flattenStyle(entry)), {})
  }
  return style && typeof style === 'object' ? style : {}
}

function pressableHeight(tree: any): number | undefined {
  const pressable = tree.root.findByType('Pressable')
  const style = pressable.props.style
  const resolved = typeof style === 'function' ? style({ pressed: false }) : style
  return flattenStyle(resolved).height as number | undefined
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
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: false })
  })

  it('no-ops presses and shows a spinner while busy', () => {
    const onPress = vi.fn()
    const tree = renderPill(
      <PillButton onPress={onPress} busy>
        Saving
      </PillButton>,
    )
    const button = tree.root.findByType('Pressable')
    expect(button.props.accessibilityState).toEqual({ disabled: false, busy: true })
    expect(button.props.onPress).toBeUndefined()
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1)
  })

  it('renders secondary, ghost, and destructive variants with a leading node', () => {
    const tree = renderPill(
      <>
        <PillButton variant="secondary" onPress={() => {}}>
          Secondary
        </PillButton>
        <PillButton variant="ghost" onPress={() => {}} leading={<></>}>
          Ghost
        </PillButton>
        <PillButton variant="destructive" onPress={() => {}}>
          Delete
        </PillButton>
      </>,
    )
    const labels = textContents(tree)
    expect(labels).toContain('Secondary')
    expect(labels).toContain('Ghost')
    expect(labels).toContain('Delete')
  })

  it('renders an icon-only square (width = height) when given a leading icon and no label', () => {
    const tree = renderPill(
      <PillButton accessibilityLabel="Create" leading={<></>} />,
    )
    const pressable = tree.root.findByType('Pressable')
    const flat = flattenStyle(pressable.props.style({ pressed: false }))
    expect(flat.width).toBe(50)
    expect(flat.height).toBe(50)
    expect(tree.root.findAllByType('Text')).toHaveLength(0)
  })

  it('drives the pill height from the size scale (sm < md < lg)', () => {
    expect(pressableHeight(renderPill(<PillButton size="sm" onPress={() => {}}>Small</PillButton>))).toBe(40)
    expect(pressableHeight(renderPill(<PillButton onPress={() => {}}>Medium</PillButton>))).toBe(50)
    expect(pressableHeight(renderPill(<PillButton size="lg" onPress={() => {}}>Large</PillButton>))).toBe(56)
  })

  it('darkens the destructive fill on press instead of dimming opacity (web parity)', () => {
    const tree = renderPill(
      <PillButton variant="destructive" onPress={() => {}}>
        Delete
      </PillButton>,
    )
    const pressable = tree.root.findByType('Pressable')
    const rest = flattenStyle(pressable.props.style({ pressed: false }))
    const pressed = flattenStyle(pressable.props.style({ pressed: true }))

    expect(pressed.backgroundColor).not.toBe(rest.backgroundColor)
    expect(pressed.opacity).toBeUndefined()
  })
})
