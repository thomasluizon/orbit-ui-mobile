import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { expect } from 'vitest'

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')

type PressHost = { type: unknown; props: Record<string, unknown> }
type PressTree = { root: { findAll(predicate: (node: PressHost) => boolean): PressHost[] } }

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
  const resting = resolved(false)
  void renderer.act(() => { (host().props.onPressIn as (() => void) | undefined)?.() })
  expect(resolved(true)).toMatchObject({ backgroundColor, borderRadius, overflow: 'hidden' })
  expect(resolved(true).backgroundColor).not.toBe(resting.backgroundColor)
  void renderer.act(() => { (host().props.onPressOut as (() => void) | undefined)?.() })
  expect(resolved(false)).toEqual(resting)
}
