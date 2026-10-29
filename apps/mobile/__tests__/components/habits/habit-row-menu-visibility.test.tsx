import React from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { StyleSheet, type ViewStyle } from 'react-native'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PortalHost } from '@rn-primitives/portal'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { resolveMotionPreset, type MotionScenario } from '@orbit/shared/theme'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { BackHandler, __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'
import { Keyframe } from '@/test-mocks/react-native-reanimated'

const native = vi.hoisted(() => ({ reduced: false, present: vi.fn(() => Promise.resolve()), dismiss: vi.fn(() => Promise.resolve()) }))
vi.unmock('@/components/ui/sheet')
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('@/lib/motion', async (original) => ({
  ...await original<typeof import('@/lib/motion')>(),
  getPrefersReducedMotion: () => Promise.resolve(native.reduced),
  usePrefersReducedMotion: () => native.reduced,
  useResolvedMotionPreset: (scenario: MotionScenario) => resolveMotionPreset(scenario, native.reduced),
}))
vi.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: class extends React.Component<{ children?: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }> {
    present = native.present
    dismiss = native.dismiss
    render() { return <>{this.props.header}{this.props.children}{this.props.footer}</> }
  },
}))

function restingStyle(host: ReactTestInstance) {
  const declaredStyle: unknown = typeof host.props.style === 'function' ? host.props.style({ pressed: false }) : host.props.style
  return StyleSheet.flatten<ViewStyle>(declaredStyle ?? {})
}

// WHY: Android restores the entering host's captured opacity after settlement. https://github.com/software-mansion/react-native-reanimated/blob/4.5.1/Common/cpp/reanimated/LayoutAnimations/LayoutAnimationsProxyCommon.cpp#L38-L77
function captureAndroidEnteringPaint(tree: ReactTestRenderer) {
  const opacity = new Map<ReactTestInstance, number>()
  if (!native.reduced) {
    for (const host of tree.root.findAll(node => typeof node.type === 'string' && node.props.entering instanceof Keyframe)) {
      const entering = host.props.entering as Keyframe
      const initialOpacity = Number(restingStyle(host).opacity ?? 1)
      opacity.set(host, 0)
      setTimeout(() => opacity.set(host, Number(entering.definitions[100]?.opacity ?? initialOpacity)), entering.durationMs)
      setTimeout(() => opacity.set(host, initialOpacity), (entering.durationMs ?? 0) + 1)
    }
  }
  return (target: ReactTestInstance) => {
    for (let node: ReactTestInstance | null = target; node; node = (node as ReactTestInstance & { parent: ReactTestInstance | null }).parent) {
      if (typeof node.type === 'string') {
        const style = restingStyle(node)
        if ((opacity.get(node) ?? style.opacity ?? 1) === 0 || style.display === 'none') return false
      }
    }
    return true
  }
}

let tree: ReactTestRenderer | undefined
beforeEach(() => { vi.useFakeTimers(); native.present.mockClear(); native.dismiss.mockClear() })
afterEach(async () => {
  await act(() => tree?.update(<></>))
  tree = undefined
  vi.useRealTimers()
  __resetTestHostConfig()
})

function menuHost() {
  return tree!.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'menu')[0]!
}

async function openRowMenu(width: number, reduced: boolean) {
  native.reduced = reduced
  __setWindowDimensions({ width, height: 900, scale: 1, fontScale: 1 })
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  await act(() => { tree = create(<><PortalHost /><HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onEdit, onDelete }} /></>) })
  const trigger = tree!.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'habits.actions.more')[0]!
  await act(() => (trigger.props.onPress as () => void)())
  const visible = captureAndroidEnteringPaint(tree!)
  if (width >= 900) {
    await act(() => (menuHost().props.onLayout as (event: unknown) => void)({ nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 112 } } }))
  }
  await act(() => { vi.advanceTimersByTime(resolveMotionPreset('menu', reduced).enterDuration) })
  expect(menuHost().findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'menuitem').every(visible)).toBe(true)
  await act(() => { vi.advanceTimersByTime(1000) })
  return { onEdit, onDelete, visible }
}

it.each([412, 899, 900, 1200].flatMap(width => [false, true].map(reduced => ({ width, reduced }))))(
  'keeps the row menu painted after entrance at width $width with reduced motion $reduced',
  async ({ width, reduced }) => {
    const { onEdit, onDelete, visible } = await openRowMenu(width, reduced)
    const menu = menuHost()
    expect(menu).toBeDefined()
    const items = menu.findAll(node => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'menuitem')
    expect(items).toHaveLength(2)
    expect(items.every(visible)).toBe(true)
    expect(onDelete).not.toHaveBeenCalled()
    await act(() => (items[0]!.props.onPress as () => void)())
    if (width < 900) {
      expect(native.present).toHaveBeenCalledExactlyOnceWith(0, !reduced)
      expect(native.dismiss).toHaveBeenCalledExactlyOnceWith(!reduced)
      expect(onEdit).not.toHaveBeenCalled()
      const sheet = tree!.root.findAll(node => node.type === TrueSheet)[0]!
      await act(() => (sheet.props.onDidDismiss as () => void)())
    }
    expect(onEdit).toHaveBeenCalledOnce()
    expect(tree!.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'menu')).toHaveLength(0)
  },
)

it.each(['backdrop', 'back'] as const)('dismisses the settled anchored row menu by %s without selecting an item', async (dismissal) => {
  const { onEdit, onDelete } = await openRowMenu(900, false)
  if (dismissal === 'back') await act(() => { expect(BackHandler.emitBackPress()).toBe(true) })
  else {
    const backdrop = tree!.root.findAll(node => String(node.type) === 'Pressable' && node.props.accessible === false && node.props.accessibilityElementsHidden === true)[0]!
    await act(() => (backdrop.props.onPress as () => void)())
  }
  expect(tree!.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'menu')).toHaveLength(0)
  expect(onEdit).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})
