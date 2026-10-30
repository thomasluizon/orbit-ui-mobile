import { describe, expect, it, vi } from 'vitest'
import { StyleSheet } from 'react-native'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { CheckCircle } from '@/components/habits/habit-row-check-circle'
import { triggerHaptic } from '@/lib/haptics'
import { withTimingCalls } from '../../../test-mocks/react-native-reanimated'
import { motionDurations, orbitalMotion } from '@orbit/shared/theme'

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
})
