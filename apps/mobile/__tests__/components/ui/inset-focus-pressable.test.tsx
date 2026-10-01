import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'

const TestRenderer = require('react-test-renderer')

describe('InsetFocusPressable', () => {
  it.each([false, true])('preserves geometry and native focus callbacks with disabled %s', (disabled) => {
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<InsetFocusPressable disabled={disabled} onFocus={onFocus} onBlur={onBlur}
        style={({ pressed }) => ({ minHeight: 44, padding: 12, borderRadius: 999, opacity: pressed ? 0.8 : 1 })} />)
    })
    const host = () => tree!.root.findByType('Pressable')
    const style = () => StyleSheet.flatten(host().props.style({ pressed: false }))
    const resting = style()
    const target = {}
    const event = { nativeEvent: { target: 1 }, target, currentTarget: target }
    TestRenderer.act(() => host().props.onFocus(event))
    expect(onFocus).toHaveBeenCalledWith(event)
    expect(style()).toMatchObject(resting)
    expect(style().outlineWidth ?? 0).toBe(disabled ? 0 : 2)
    if (!disabled) expect(style().outlineWidth + style().outlineOffset).toBeLessThanOrEqual(0)
    TestRenderer.act(() => host().props.onBlur(event))
    expect(onBlur).toHaveBeenCalledWith(event)
    expect(style().outlineWidth ?? 0).toBe(0)
  })

  it('uses the caller contrast color on a filled control', () => {
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<InsetFocusPressable focusColor="white" focusOffset={-6} />)
    })
    const host = () => tree!.root.findByType('Pressable')
    const target = {}
    TestRenderer.act(() => host().props.onFocus({ nativeEvent: { target: 1 }, target, currentTarget: target }))
    expect(StyleSheet.flatten(host().props.style({ pressed: false }))).toMatchObject({ outlineWidth: 2, outlineOffset: -6, outlineColor: 'white' })
  })

  it('lets descendant focus reach the caller without drawing a second ring', () => {
    const onFocus = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<InsetFocusPressable onFocus={onFocus} />) })
    const host = () => tree!.root.findByType('Pressable')
    const event = { nativeEvent: { target: 2 }, target: {}, currentTarget: {} }
    TestRenderer.act(() => host().props.onFocus(event))
    expect(onFocus).toHaveBeenCalledWith(event)
    expect(StyleSheet.flatten(host().props.style({ pressed: false })).outlineWidth ?? 0).toBe(0)
  })
})
