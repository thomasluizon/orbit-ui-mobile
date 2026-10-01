import { StyleSheet, Text, View } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { Switch } from '@/components/ui/switch'
import { createTokensV2 } from '@/lib/theme'

const theme = vi.hoisted((): { currentScheme: 'orange'; currentTheme: 'dark' | 'light' } => ({ currentScheme: 'orange', currentTheme: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => theme }))

const TestRenderer = require('react-test-renderer')

describe('InsetFocusPressable', () => {
  it.each(['dark', 'light'] as const)('paints above both switch tracks in %s without changing focus ownership', (mode) => {
    theme.currentTheme = mode
    for (const checked of [false, true]) {
      const onChange = vi.fn()
      let tree: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => { tree = TestRenderer.create(<Switch label="Switch" checked={checked} onChange={onChange} />) })
      const host = () => tree!.root.findByType('Pressable')
      const resting = StyleSheet.flatten(host().props.style({ pressed: false }))
      const target = {}
      TestRenderer.act(() => host().props.onFocus({ target, currentTarget: target }))
      const siblings = host().findAllByType('View').filter((view: { parent: { parent: unknown } }) => view.parent.parent === host())
      expect(siblings).toHaveLength(2)
      const [track, ring] = siblings
      expect(StyleSheet.flatten(track.props.style)).toMatchObject({ width: 48, height: 28 })
      expect(ring.props).toMatchObject({ pointerEvents: 'none', accessible: false, focusable: false })
      expect(StyleSheet.flatten(ring.props.style)).toMatchObject({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, outlineWidth: 2, outlineOffset: -2, outlineColor: createTokensV2('orange', mode).fg1 })
      expect(StyleSheet.flatten(host().props.style({ pressed: false }))).toEqual(resting)
      TestRenderer.act(() => host().props.onPress())
      expect(onChange).toHaveBeenCalledWith(!checked)
      TestRenderer.act(() => host().props.onBlur({ target, currentTarget: target }))
      expect(host().findAllByProps({ pointerEvents: 'none' })).toHaveLength(0)
      TestRenderer.act(() => tree!.unmount())
    }
  })

  it('keeps a flush leading well below the shape-matched foreground and forwards the ref', () => {
    const ref = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<InsetFocusPressable ref={ref} style={({ pressed }) => ({ borderRadius: pressed ? 12 : 20, minHeight: 68 })}>
      {({ pressed }) => <View testID="well" style={{ width: 46, height: 46, backgroundColor: 'white' }}><Text>{String(pressed)}</Text></View>}
    </InsetFocusPressable>) })
    const host = () => tree!.root.findByType('Pressable')
    expect(ref).toHaveBeenCalledWith(expect.objectContaining({ focus: expect.any(Function) }))
    const target = {}
    TestRenderer.act(() => host().props.onFocus({ target, currentTarget: target }))
    const siblings = host().findAllByType('View').filter((view: { parent: { parent: unknown } }) => view.parent.parent === host())
    expect(siblings).toHaveLength(2)
    expect(siblings[0].props.testID).toBe('well')
    expect(StyleSheet.flatten(siblings[1].props.style)).toMatchObject({ borderRadius: 20, outlineWidth: 2 })
    expect(tree!.root.findByType('Text').children).toEqual(['false'])
    TestRenderer.act(() => tree!.unmount())
  })

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
    expect(host().findAllByProps({ pointerEvents: 'none' })).toHaveLength(disabled ? 0 : 2)
    if (!disabled) {
      const ring = StyleSheet.flatten(host().findAllByType('View').at(-1).props.style)
      expect(ring.outlineWidth + ring.outlineOffset).toBeLessThanOrEqual(0)
    }
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
    expect(StyleSheet.flatten(host().findAllByType('View').at(-1).props.style)).toMatchObject({ outlineWidth: 2, outlineOffset: -6, outlineColor: 'white' })
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
