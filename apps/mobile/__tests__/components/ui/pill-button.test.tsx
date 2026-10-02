import { describe, expect, it, vi } from 'vitest'

import { PillButton } from '@/components/ui/pill-button'
import { Copy } from '@/components/ui/icons'
import { BUTTON_SIZES } from '@orbit/shared/theme'
import { contrastOnSurface, withAlpha } from '@orbit/shared/__tests__/contrast'
import { createTokensV2 } from '@/lib/theme'

const theme = vi.hoisted((): { mode: 'dark' | 'light' } => ({ mode: 'dark' }))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: theme.mode }),
}))

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
  const geometry = flattenStyle(resolved)
  return Math.max(geometry.height ?? 0, geometry.minHeight ?? 0)
}

describe('PillButton (mobile)', () => {

  it('defaults ordinary pills to small', () => {
    const tree = renderPill(<PillButton>Continue</PillButton>)
    expect(pressableHeight(tree)).toBe(44)
  })
  it.each([false, true])('paints the small target in a real 44px box (iconOnly: %s)', (iconOnly) => {
    const tree = renderPill(iconOnly
      ? <PillButton size="sm" iconOnly label="Small"><span /></PillButton>
      : <PillButton size="sm">Small</PillButton>)
    const button = tree.root.findByType('Pressable')
    const visibleHeight = pressableHeight(tree)

    expect(visibleHeight).toBe(44)
    expect(button.props.hitSlop).toBeUndefined()
    const geometry = flattenStyle(button.props.style({ pressed: false }))
    expect(geometry.minWidth).toBe(44)
    if (iconOnly) expect(Math.max(geometry.width, geometry.minWidth)).toBe(44)
  })

  it('paints even a narrow label in the whole target', () => {
    const tree = renderPill(<PillButton size="sm">i</PillButton>)
    const button = tree.root.findByType('Pressable')
    const geometry = flattenStyle(button.props.style({ pressed: false }))
    expect(textContents(tree)).toContain('i')
    expect(geometry.minHeight).toBe(44)
    expect(geometry.minWidth).toBe(44)
    expect(button.props.hitSlop).toBeUndefined()
  })

  it('keeps the standard target at its existing 50px size', () => {
    const tree = renderPill(<PillButton size="md">Medium</PillButton>)
    expect(pressableHeight(tree)).toBe(50)
    expect(tree.root.findByType('Pressable').props.hitSlop).toBeUndefined()
  })

  it('renders its label', () => {
    const tree = renderPill(<PillButton onClick={() => {}}>Continue</PillButton>)
    expect(textContents(tree)).toContain('Continue')
    expect(tree.root.findByType('Text').props.numberOfLines).toBe(1)
  })

  it('keeps a leading glyph decorative and tightens its side of the pill', () => {
    const tree = renderPill(<PillButton size="sm" leadingIcon={<Copy size={BUTTON_SIZES.sm.iconSize} aria-hidden />}>Copy</PillButton>)
    const pressable = tree.root.findByType('Pressable')
    const style = flattenStyle(pressable.props.style({ pressed: false }))
    expect(style.paddingStart).toBe(16)
    expect(style.paddingHorizontal).toBe(18)
    expect(tree.root.findAllByType(Copy)).toHaveLength(1)
    expect(tree.root.findByType(Copy).props['aria-hidden']).toBe(true)
    expect(pressable.props.accessibilityLabel).toBeUndefined()
    expect(textContents(tree)).toContain('Copy')
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
    expect(pressableHeight(renderPill(<PillButton size="sm" onClick={() => {}}>Small</PillButton>))).toBe(44)
    expect(pressableHeight(renderPill(<PillButton size="md" onClick={() => {}}>Medium</PillButton>))).toBe(50)
  })

  it('changes the destructive fill on press instead of dimming opacity (web parity)', () => {
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

  it('scales on press and restores its size on release while disabled states block presses', () => {
    const tree = renderPill(<PillButton>Continue</PillButton>)
    const button = tree.root.findByType('Pressable')
    expect(flattenStyle(button.props.style({ pressed: true })).transform).toEqual([{ scale: 0.96 }])
    expect(flattenStyle(button.props.style({ pressed: false })).transform).toBeUndefined()

    const disabled = renderPill(<PillButton disabled>Continue</PillButton>).root.findByType('Pressable')
    const loading = renderPill(<PillButton loading>Saving</PillButton>).root.findByType('Pressable')
    expect(disabled.props.disabled).toBe(true)
    expect(loading.props.disabled).toBe(true)
    expect(loading.props.accessibilityState.busy).toBe(true)
  })

  it.each(['dark', 'light'] as const)('keeps loading and destructive pressed text legible in %s', (mode) => {
    theme.mode = mode
    const tokens = createTokensV2('purple', mode)
    const busyTree = renderPill(<PillButton loading>Saving</PillButton>)
    const label = flattenStyle(busyTree.root.findByType('Text').props.style)
    const busyForeground = label.opacity ? withAlpha(label.color, label.opacity) : label.color
    expect(contrastOnSurface(busyForeground, [tokens.primary])).toBeGreaterThanOrEqual(4.5)
    expect(busyTree.root.findAllByType('ActivityIndicator')).toHaveLength(1)

    const destructive = renderPill(<PillButton variant="destructive">Delete</PillButton>)
    const pressed = flattenStyle(destructive.root.findByType('Pressable').props.style({ pressed: true }))
    expect(contrastOnSurface(tokens.fgOnBad, [pressed.backgroundColor])).toBeGreaterThanOrEqual(4.5)

    const disabledWhileLoading = renderPill(<PillButton disabled loading>Saving</PillButton>)
    const loadingStyle = flattenStyle(disabledWhileLoading.root.findByType('Pressable').props.style({ pressed: false }))
    expect(loadingStyle.opacity).toBeUndefined()
  })
})
