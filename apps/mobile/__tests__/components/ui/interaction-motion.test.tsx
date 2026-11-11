import { describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { CheckCircle } from '@/components/habits/habit-row-check-circle'
import { HabitCheck } from '@/components/habits/habit-check'
import { ListScope } from '@/components/motion/list-scope'
import { triggerHaptic } from '@/lib/haptics'
import { sharedValues, springState, withSpringCalls, withTimingCalls } from '../../../test-mocks/react-native-reanimated'
import { motionDurations, motionSprings, orbitalMotion } from '@orbit/shared/theme'

const preference = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/lib/motion', () => ({ usePrefersReducedMotion: () => preference.reduced }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: 'dark' }) }))
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }))
const TestRenderer = require('react-test-renderer')

describe('interaction motion', () => {
  it('uses shared press timing and settles a held press when reduced motion changes', () => {
    preference.reduced = false
    const onPress = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<MotionPressable onPress={onPress} />) })
    const host = () => tree!.root.findByType('Pressable')
    TestRenderer.act(() => host().props.onPressIn())
    const held = StyleSheet.flatten(host().props.style)
    expect(held).toMatchObject({ transform: [{ scale: orbitalMotion.press.scale }] })
    expect(held.transition).toContain(`transform ${motionDurations.press}ms`)
    expect(Object.keys(held).filter((key) => key.startsWith('transition'))).toEqual(['transition'])
    TestRenderer.act(() => host().props.onPress())
    expect(onPress).toHaveBeenCalledOnce()
    preference.reduced = true
    TestRenderer.act(() => tree!.update(<MotionPressable onPress={onPress} />))
    const settled = StyleSheet.flatten(host().props.style)
    expect(settled).toMatchObject({ transform: [{ scale: 1 }], transition: 'none' })
    expect(Object.keys(settled).filter((key) => key.startsWith('transition'))).toEqual(['transition'])
    TestRenderer.act(() => tree!.unmount())
  })

  it('sends the completion immediately with one light haptic', () => {
    const onToggle = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<CheckCircle state="empty" onToggle={onToggle} disabled={false} accessibilityLabel="Complete" />) })
    TestRenderer.act(() => tree!.root.findByType('Pressable').props.onPress())
    expect(onToggle).toHaveBeenCalledOnce()
    expect(triggerHaptic).toHaveBeenCalledWith('selection')
    TestRenderer.act(() => tree!.unmount())
  })

  it('fills completion without overshoot', () => {
    preference.reduced = false
    withTimingCalls.length = 0
    let tree: ReturnType<typeof TestRenderer.create>
    const props = { onToggle: vi.fn(), disabled: false, accessibilityLabel: 'Complete' }
    TestRenderer.act(() => { tree = TestRenderer.create(<CheckCircle {...props} state="empty" />) })
    TestRenderer.act(() => tree!.update(<CheckCircle {...props} state="done" />))
    expect(withTimingCalls.some((call) => typeof call.value === 'number' && call.value > 1)).toBe(false)
    TestRenderer.act(() => tree!.unmount())
  })

  it('scales the check on the press duration and drops the scale under reduced motion', () => {
    preference.reduced = false
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<CheckCircle state="empty" onToggle={vi.fn()} disabled={false} accessibilityLabel="Complete" />) })
    const scaler = () => {
      const scalers = tree!.root.findAllByType('AnimatedView')
        .filter((node: { props: { testID?: string } }) => node.props.testID !== 'habit-check')
      expect(scalers).toHaveLength(1)
      return StyleSheet.flatten(scalers[0].props.style) as { transform: { scale: number }[]; transition: string }
    }
    TestRenderer.act(() => tree!.root.findByType('Pressable').props.onPressIn())
    expect(scaler()).toMatchObject({ transform: [{ scale: orbitalMotion.press.scale }] })
    expect(scaler().transition).toContain(`transform ${motionDurations.press}ms`)
    preference.reduced = true
    TestRenderer.act(() => tree!.update(<CheckCircle state="empty" onToggle={vi.fn()} disabled={false} accessibilityLabel="Complete" />))
    expect(scaler()).toMatchObject({ transform: [{ scale: 1 }], transition: 'none' })
    TestRenderer.act(() => tree!.unmount())
  })

  it('settles the check on the completion spring once when a mounted check turns done', () => {
    preference.reduced = false
    withSpringCalls.length = 0
    let tree: ReturnType<typeof TestRenderer.create>
    const props = { onToggle: vi.fn(), disabled: false, accessibilityLabel: 'Complete' }
    TestRenderer.act(() => { tree = TestRenderer.create(<CheckCircle {...props} state="done" />) })
    expect(withSpringCalls).toEqual([])
    TestRenderer.act(() => tree!.update(<CheckCircle {...props} state="empty" />))
    expect(withSpringCalls).toEqual([])
    TestRenderer.act(() => tree!.update(<CheckCircle {...props} state="done" />))
    expect(withSpringCalls).toEqual([{ value: 1, config: { ...motionSprings.completion, overshootClamping: true } }])
    TestRenderer.act(() => tree!.unmount())
  })

  it('returns the check to rest when it turns back before the spring settles', () => {
    preference.reduced = false
    springState.settledValue = 3
    sharedValues.length = 0
    let tree: ReturnType<typeof TestRenderer.create>
    const props = { onToggle: vi.fn(), disabled: false, accessibilityLabel: 'Complete' }
    TestRenderer.act(() => { tree = TestRenderer.create(<CheckCircle {...props} state="empty" />) })
    TestRenderer.act(() => tree!.update(<CheckCircle {...props} state="done" />))
    expect(sharedValues.some((shared) => shared.value === 3)).toBe(true)
    TestRenderer.act(() => tree!.update(<CheckCircle {...props} state="empty" />))
    delete springState.settledValue
    expect(sharedValues.filter((shared) => shared.value === 3)).toEqual([])
    TestRenderer.act(() => tree!.unmount())
  })

  it.each([
    { name: 'a logged habit', before: { status: 'empty' }, after: { status: 'done' } },
    { name: 'a parent whose sub-habits are all done', before: { status: 'empty', progress: { done: 1, total: 2 } }, after: { status: 'empty', progress: { done: 2, total: 2 } } },
  ] as const)('keeps the check still when $name turns done in the same render as a list scope change', ({ before, after }) => {
    preference.reduced = false
    withSpringCalls.length = 0
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<ListScope scope="yesterday"><HabitCheck {...before} label="Check" /></ListScope>) })
    TestRenderer.act(() => tree!.update(<ListScope scope="today"><HabitCheck {...after} label="Check" /></ListScope>))
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'habit-check' }).props.style)).toMatchObject({ borderWidth: 0 })
    expect(withSpringCalls).toEqual([])
    TestRenderer.act(() => tree!.unmount())
  })

  it('settles a mounted check that turns done while the list scope stays the same', () => {
    preference.reduced = false
    withSpringCalls.length = 0
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<ListScope scope="today"><HabitCheck status="empty" label="Check" /></ListScope>) })
    TestRenderer.act(() => tree!.update(<ListScope scope="today"><HabitCheck status="done" label="Check" /></ListScope>))
    expect(withSpringCalls).toEqual([{ value: 1, config: { ...motionSprings.completion, overshootClamping: true } }])
    TestRenderer.act(() => tree!.unmount())
  })

  it('plays no completion feedback under reduced motion', () => {
    preference.reduced = true
    withSpringCalls.length = 0
    let tree: ReturnType<typeof TestRenderer.create>
    const props = { onToggle: vi.fn(), disabled: false, accessibilityLabel: 'Complete' }
    TestRenderer.act(() => { tree = TestRenderer.create(<CheckCircle {...props} state="empty" />) })
    TestRenderer.act(() => tree!.update(<CheckCircle {...props} state="done" />))
    expect(withSpringCalls).toEqual([])
    TestRenderer.act(() => tree!.unmount())
  })

})
