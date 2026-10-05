import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { expect } from 'vitest'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

type PressHost = { type: unknown; props: Record<string, unknown> }
type PressTree = { root: { findAll(predicate: (node: PressHost) => boolean): PressHost[] } }

type PressControl = {
  props: Record<string, unknown>
  findAll(predicate: (node: PressHost) => boolean): PressHost[]
}

export function expectPressPaint(control: PressControl, expected: {
  fill: string
  borderRadius: number
  restFill?: string
  overlay?: boolean
  scale?: number | null
}) {
  const hosts = control.findAll((node) => node.type === 'Pressable')
  expect(hosts).toHaveLength(1)
  const host = hosts[0]!
  const resolved = (pressed: boolean) => {
    const style = host.props.style as StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
    return StyleSheet.flatten(typeof style === 'function' ? style({ pressed }) : style)
  }
  const overlayStyle = () => {
    const fills = control.findAll((node) => node.type === 'View' && node.props.pointerEvents === 'none' && node.props.accessible === false)
    expect(fills).toHaveLength(1)
    return StyleSheet.flatten(fills[0]!.props.style as StyleProp<ViewStyle>)
  }
  const resting = resolved(false)
  expect(resting.backgroundColor ?? 'transparent').toBe(expected.restFill ?? 'transparent')
  expect(resting.transform).toBeUndefined()
  expect(resting.opacity ?? 1).toBe(1)
  if (expected.overlay) expect(overlayStyle()).toMatchObject({ backgroundColor: expected.fill, opacity: 0 })
  void renderer.act(() => { (host.props.onPressIn as () => void)() })
  const pressed = resolved(true)
  expect(pressed.opacity ?? 1).toBe(1)
  expect(pressed).toMatchObject({ borderRadius: expected.borderRadius, overflow: 'hidden' })
  expect(pressed.transform).toEqual(expected.scale === null ? undefined : [{ scale: expected.scale ?? 0.96 }])
  if (expected.overlay) {
    expect(pressed.backgroundColor ?? 'transparent').toBe(expected.restFill ?? 'transparent')
    expect(overlayStyle()).toMatchObject({ ...StyleSheet.absoluteFill, backgroundColor: expected.fill, opacity: 1 })
  } else {
    expect(pressed.backgroundColor).toBe(expected.fill)
  }
  void renderer.act(() => { (host.props.onPressOut as () => void)() })
  expect(resolved(false)).toEqual(resting)
  if (expected.overlay) expect(overlayStyle().opacity).toBe(0)
}

export function expectPressFill(tree: PressTree, label: string, backgroundColor: string, borderRadius: number) {
  const host = () => {
    const matches = tree.root.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)
    expect(matches).toHaveLength(1)
    return matches[0]!
  }
  const resolved = (pressed: boolean) => {
    const style = host().props.style as StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
    return StyleSheet.flatten(typeof style === 'function' ? style({ pressed }) : style)
  }
  expect(host().props.hitSlop).toBeUndefined()
  const resting = resolved(false)
  expect(resting.minHeight ?? resting.height).toBeGreaterThanOrEqual(48)
  expect(resting.minWidth ?? resting.width).toBeGreaterThanOrEqual(48)
  void renderer.act(() => { (host().props.onPressIn as (() => void) | undefined)?.() })
  expect(resolved(true)).toMatchObject({ backgroundColor, borderRadius, overflow: 'hidden' })
  expect(resolved(true).backgroundColor).not.toBe(resting.backgroundColor)
  void renderer.act(() => { (host().props.onPressOut as (() => void) | undefined)?.() })
  expect(resolved(false)).toEqual(resting)
}
