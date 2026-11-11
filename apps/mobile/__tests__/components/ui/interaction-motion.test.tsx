import { describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { CheckCircle } from '@/components/habits/habit-row-check-circle'
import { triggerHaptic } from '@/lib/haptics'
import { withSpringCalls, withTimingCalls } from '../../../test-mocks/react-native-reanimated'
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
    expect(StyleSheet.flatten(host().props.style)).toMatchObject({ transform: [{ scale: orbitalMotion.press.scale }], transitionDuration: motionDurations.press })
    TestRenderer.act(() => host().props.onPress())
    expect(onPress).toHaveBeenCalledOnce()
    preference.reduced = true
    TestRenderer.act(() => tree!.update(<MotionPressable onPress={onPress} />))
    expect(StyleSheet.flatten(host().props.style)).toMatchObject({ transform: [{ scale: 1 }], transitionDuration: 0 })
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
    expect(withSpringCalls.length).toBeGreaterThan(0)
    for (const call of withSpringCalls) expect(call).toEqual({ value: 1, config: { ...motionSprings.completion, overshootClamping: true } })
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
