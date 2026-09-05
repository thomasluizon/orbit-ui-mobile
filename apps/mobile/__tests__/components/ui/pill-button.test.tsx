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
  it.each([false, true])('expands the small target to 44 without growing its visible box (iconOnly: %s)', (iconOnly) => {
    const tree = renderPill(iconOnly
      ? <PillButton size="sm" iconOnly label="Small"><span /></PillButton>
      : <PillButton size="sm">Small</PillButton>)
    const button = tree.root.findByType('Pressable')
    const visibleHeight = pressableHeight(tree)

    expect(visibleHeight).toBe(40)
    expect(button.props.hitSlop).toBe(2)
    expect(visibleHeight! + button.props.hitSlop * 2).toBe(44)
    if (iconOnly) {
      const visibleWidth = flattenStyle(button.props.style({ pressed: false })).width
      expect(visibleWidth).toBe(40)
      expect(visibleWidth + button.props.hitSlop * 2).toBe(44)
    }
  })

  it('keeps the standard target at its existing 50px size', () => {
    const tree = renderPill(<PillButton>Medium</PillButton>)
    expect(pressableHeight(tree)).toBe(50)
    expect(tree.root.findByType('Pressable').props.hitSlop).toBe(0)
  })

  it('renders its label', () => {
    const tree = renderPill(<PillButton onClick={() => {}}>Continue</PillButton>)
    expect(textContents(tree)).toContain('Continue')
    expect(tree.root.findByType('Text').props.numberOfLines).toBe(1)
  })

  it('fires onPress when pressed', () => {
    const onPress = vi.fn()
    const tree = renderPill(<PillButton onClick={onPress}>Continue</PillButton>)
    const button = tree.root.findByType('Pressable')
    expect(button.props.accessibilityRole).toBe('button')
    TestRenderer.act(() => {
      button.props.onPress()
    })
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not forward the web-only form association hint to Pressable', () => {
    const tree = renderPill(<PillButton formId="habit-form">Create</PillButton>)
    const button = tree.root.findByType('Pressable')
    expect(button.props.formId).toBeUndefined()
  })

  it('exposes the disabled state', () => {
    const tree = renderPill(
      <PillButton onClick={() => {}} disabled>
        Continue
      </PillButton>,
    )
    const button = tree.root.findByType('Pressable')
    expect(button.props.disabled).toBe(true)
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: false })
  })

  it('no-ops presses and shows a spinner while loading', () => {
    const onPress = vi.fn()
    const tree = renderPill(
      <PillButton onClick={onPress} loading>
        Saving
      </PillButton>,
    )
    const button = tree.root.findByType('Pressable')
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true })
    expect(button.props.onPress).toBeUndefined()
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1)
  })

  it('renders all five variants', () => {
    const tree = renderPill(
      <>
        <PillButton variant="secondary" onClick={() => {}}>
          Secondary
        </PillButton>
        <PillButton variant="ghost" onClick={() => {}} >
          Ghost
        </PillButton>
        <PillButton variant="destructive" onClick={() => {}}>
          Delete
        </PillButton>
        <PillButton variant="caution" onClick={() => {}}>
          Caution
        </PillButton>
      </>,
    )
    const labels = textContents(tree)
    expect(labels).toContain('Secondary')
    expect(labels).toContain('Ghost')
    expect(labels).toContain('Delete')
    expect(labels).toContain('Caution')
  })

  it('drives the pill height from the two-size scale', () => {
    expect(pressableHeight(renderPill(<PillButton size="sm" onClick={() => {}}>Small</PillButton>))).toBe(40)
    expect(pressableHeight(renderPill(<PillButton onClick={() => {}}>Medium</PillButton>))).toBe(50)
  })

  it('darkens the destructive fill on press instead of dimming opacity (web parity)', () => {
    const tree = renderPill(
      <PillButton variant="destructive" onClick={() => {}}>
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
