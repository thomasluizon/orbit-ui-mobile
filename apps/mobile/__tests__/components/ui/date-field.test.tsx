import React from 'react'
import { Pressable } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { DateField } from '@/components/ui/date-field'
import { Calendar } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'

/** The global setup stubs DateField away; this suite tests the real one. */
vi.unmock('@/components/ui/date-field')

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 0 } }),
}))

const themeState = vi.hoisted(() => ({ mode: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: themeState.mode }),
}))

const TestRenderer = require('react-test-renderer')

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten))
  if (style && typeof style === 'object') return style as Record<string, unknown>
  return {}
}

function render(element: React.ReactElement) {
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(element)
  })
  return tree
}

function dayTargets(tree: any) {
  return tree.root
    .findAllByType(Pressable)
    .filter((node: any) => typeof node.props.accessibilityState?.selected === 'boolean')
}

describe('DateField (mobile)', () => {
  it.each(['dark', 'light'] as const)('paints month and year controls with the hover role in %s', (mode) => {
    themeState.mode = mode
    const tokens = createTokensV2('purple', mode)
    const tree = render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    TestRenderer.act(() => tree.root.findByType(Pressable).props.onPress())
    const navigation = tree.root.findAllByType(Pressable).filter(
      (node: { props: { accessibilityState?: { selected?: boolean } } }) =>
        node.props.accessibilityState?.selected === undefined,
    ).slice(1)
    expect(navigation).toHaveLength(3)
    for (const control of navigation) {
      expect(flatten(control.props.style({ pressed: false })).backgroundColor).toBeUndefined()
      expect(flatten(control.props.style({ pressed: true }))).toMatchObject({
        backgroundColor: tokens.bgHover,
        overflow: 'hidden',
      })
    }
    const [previous, year, next] = navigation
    TestRenderer.act(() => year.props.onPress())
    for (const control of [previous, next]) {
      expect(control.props.disabled).toBe(true)
      expect(flatten(control.props.style({ pressed: true })).backgroundColor).toBeUndefined()
    }
    expect(flatten(year.props.style({ pressed: true })).backgroundColor).toBe(tokens.bgHover)
    TestRenderer.act(() => tree.unmount())
    themeState.mode = 'dark'
  })

  it('uses the approved graphic role on its field trigger', () => {
    const tree = render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    const tokens = createTokensV2('purple', 'dark')
    const trigger = tree.root.findByType(Pressable)
    const triggerStyle = flatten(trigger.props.style({ pressed: false }))

    expect(triggerStyle.backgroundColor).toBe(tokens.bgField)
    expect(tree.root.findByType(Calendar).props.color).toBe(tokens.fg3)
  })

  it('gives every day control a 44 by 44 target around its 36px circle', () => {
    const tree = render(<DateField value="2025-06-15" onChange={vi.fn()} />)

    const [trigger] = tree.root.findAllByType(Pressable)
    TestRenderer.act(() => {
      trigger.props.onPress()
    })

    const targets = dayTargets(tree)
    expect(targets.length).toBeGreaterThan(0)

    for (const target of targets) {
      const targetStyle = flatten(
        typeof target.props.style === 'function'
          ? target.props.style({ pressed: false })
          : target.props.style,
      )
      expect(targetStyle.width).toBe(44)
      expect(targetStyle.height).toBe(44)

      const circle = target.props.children
      const circleStyle = flatten(circle.props.style)
      expect(circleStyle.width).toBe(36)
      expect(circleStyle.height).toBe(36)
    }
  })

  it.each(['days', 'years'])('paints every navigation target in %s mode and clears the fill on release', (mode) => {
    const tree = render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    const tokens = createTokensV2('purple', 'dark')
    TestRenderer.act(() => tree.root.findByType(Pressable).props.onPress())
    const control = (label: string) => tree.root.findAllByType(Pressable).find(
      (node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === label,
    )!
    if (mode === 'years') TestRenderer.act(() => control('common.selectYear').props.onPress())
    for (const label of ['common.previousMonth', 'common.selectYear', 'common.nextMonth']) {
      const target = control(label)
      const resting = flatten(target.props.style({ pressed: false }))
      const pressed = flatten(target.props.style({ pressed: true }))
      expect(target.props.hitSlop).toBeUndefined()
      expect(resting.minHeight ?? resting.height).toBe(44)
      expect(resting.minWidth ?? resting.width).toBe(44)
      expect(pressed).toMatchObject({ borderRadius: 8, overflow: 'hidden' })
      expect(pressed.backgroundColor).toBe(target.props.disabled ? undefined : tokens.bgHover)
      expect(resting.backgroundColor).toBeUndefined()
      if (label !== 'common.selectYear') expect(target.props.disabled).toBe(mode === 'years')
    }
    TestRenderer.act(() => tree.unmount())
  })

  it('reports the picked day as a canonical date', () => {
    const onChange = vi.fn()
    const tree = render(<DateField value="2025-06-15" onChange={onChange} />)

    const [trigger] = tree.root.findAllByType(Pressable)
    TestRenderer.act(() => {
      trigger.props.onPress()
    })

    const targets = dayTargets(tree)
    TestRenderer.act(() => {
      targets[10]!.props.onPress()
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
