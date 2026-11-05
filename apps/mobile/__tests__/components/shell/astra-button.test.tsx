import React from 'react'
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ASTRA_POSITION_KEY } from '@orbit/shared/utils'
import { AstraButton } from '@/components/shell/astra-button'
import { useUIStore } from '@/stores/ui-store'
import { Animated } from 'react-native'

const storage = vi.hoisted(() => new Map<string, string>())
const motion = vi.hoisted(() => ({ reduced: true }))
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: (key: string) => Promise.resolve(storage.get(key) ?? null),
  setItem: (key: string, value: string) => { storage.set(key, value); return Promise.resolve() },
} }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => motion.reduced }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

let tree: ReactTestRenderer
beforeEach(() => { motion.reduced = true; storage.clear(); useUIStore.setState(useUIStore.getInitialState()) })
afterEach(async () => { await act(() => tree.unmount()); vi.restoreAllMocks() })

function host(testID: string) { return tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === testID)[0]! }
function handler(testID: string, name: string) { return host(testID).props[name] as (event?: unknown) => unknown }
async function layout(width = 412, height = 600) {
  await act(() => { handler('astra-button-area', 'onLayout')({ nativeEvent: { layout: { x: 0, y: 0, width, height } } }) })
}
async function mount() {
  await act(() => { tree = TestRenderer.create(<AstraButton hasFab scrollToTopHeight={64} />) })
  await layout()
}
function point() {
  const style = host('astra-button-position').props.style as [unknown, { transform: [{ translateX: number | { value: number } }, { translateY: number | { value: number } }] }]
  const transform = style[1].transform
  return { x: typeof transform[0].translateX === 'number' ? transform[0].translateX : transform[0].translateX.value, y: typeof transform[1].translateY === 'number' ? transform[1].translateY : transform[1].translateY.value }
}
const touch = (pageX: number, pageY: number) => ({ nativeEvent: { pageX, pageY } })

it('opens the layer by tapping its named button', async () => {
  await mount()
  expect(host('astra-button').props.accessibilityLabel).toBe('shell.astraButton.open')
  await act(() => { handler('astra-button', 'onPress')() })
  expect(useUIStore.getState().astraConversationOpen).toBe(true)
})

it('places the initial button immediately and animates only a requested snap', async () => {
  motion.reduced = false
  const timing = vi.spyOn(Animated, 'timing')
  await mount()
  expect(timing).not.toHaveBeenCalled()
  await act(() => { handler('astra-button', 'onAccessibilityAction')({ nativeEvent: { actionName: 'up' } }) })
  expect(timing).toHaveBeenCalledTimes(2)
})

it('captures a drag after the threshold, snaps and restores the position across launches', async () => {
  await mount()
  expect(point()).toEqual({ x: 336, y: 448 })
  expect(handler('astra-button-position', 'onStartShouldSetResponderCapture')(touch(350, 460))).toBe(false)
  expect(handler('astra-button-position', 'onMoveShouldSetResponderCapture')(touch(352, 462))).toBe(false)
  expect(handler('astra-button-position', 'onMoveShouldSetResponderCapture')(touch(100, 260))).toBe(true)
  await act(() => { handler('astra-button-position', 'onResponderGrant')(touch(100, 260)) })
  await act(() => { handler('astra-button-position', 'onResponderMove')(touch(90, 240)) })
  await act(() => { handler('astra-button-position', 'onResponderRelease')(touch(90, 240)) })
  expect(point()).toEqual({ x: 16, y: 228 })
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
  expect(JSON.parse(storage.get(ASTRA_POSITION_KEY)!)).toEqual(point())
  await act(() => tree.unmount())
  await mount()
  expect(point()).toEqual({ x: 16, y: 228 })
})

it.each(['left', 'right', 'up', 'down'])('exposes and executes TalkBack Move %s', async direction => {
  await mount()
  const control = host('astra-button')
  expect(control.props.accessibilityActions).toContainEqual({ name: direction, label: `shell.astraButton.${direction}` })
  await act(() => { handler('astra-button', 'onAccessibilityAction')({ nativeEvent: { actionName: direction } }) })
  expect(storage.has(ASTRA_POSITION_KEY)).toBe(true)
  expect(useUIStore.getState().astraConversationOpen).toBe(false)
  expect(point().y).toBeGreaterThanOrEqual(88)
  if (point().x === 336) expect(point().y + 60 + 16).toBeLessThanOrEqual(524)
})

it('resets after shrink and stays above tab chrome and clear of the create button', async () => {
  storage.set(ASTRA_POSITION_KEY, JSON.stringify({ x: 336, y: 448 }))
  await mount()
  await layout(320, 400)
  expect(point()).toEqual({ x: 244, y: 248 })
  expect(JSON.parse(storage.get(ASTRA_POSITION_KEY)!)).toEqual(point())
  expect(point().y + 60 + 16).toBeLessThanOrEqual(324)
  await act(() => useUIStore.getState().registerOpenOverlay('sheet'))
  expect(tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'astra-button')).toHaveLength(0)
})
