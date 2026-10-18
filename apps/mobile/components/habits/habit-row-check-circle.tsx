import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import { useEffect, useRef } from 'react'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { usePrefersReducedMotion } from '@/lib/motion'
import type { createTokensV2 } from '@/lib/theme'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import { HabitCheck } from './habit-check'

interface CheckCircleProps {
  state: HabitStatus
  unavailable?: boolean
  onToggle: () => void
  disabled: boolean
  accessibilityLabel: string
  accessibilityHint?: string
  tokens: ReturnType<typeof createTokensV2>
}

export function CheckCircle({
  state,
  unavailable = false,
  onToggle,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  tokens,
}: Readonly<CheckCircleProps>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const popScale = useSharedValue(1)
  const previousState = useRef(state)

  useEffect(() => {
    if (state === 'done' && previousState.current !== 'done' && !prefersReducedMotion) {
      popScale.value = withSequence(
        withTiming(1.08, { duration: 80 }),
        withTiming(1, { duration: 80 }),
      )
    }
    previousState.current = state
  }, [popScale, prefersReducedMotion, state])

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: popScale.value }],
  }))

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      hitSlop={0}
      focusOffset={-10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={disabled ? accessibilityHint : undefined}
      accessibilityState={{ disabled }}
      style={({ pressed }) => {
        return {
          width: 48,
          minHeight: 48,
          borderRadius: 22,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed && !disabled ? tokens.bgHover : 'transparent',
          opacity: disabled ? 0.4 : 1,
          transform: [{ scale: pressed && !disabled && !prefersReducedMotion ? 0.96 : 1 }],
        }
      }}
    >
      <Animated.View style={popStyle} accessible={false}>
        <HabitCheck status={state} unavailable={unavailable} label={unavailable ? undefined : accessibilityLabel} />
      </Animated.View>
    </Pressable>
  )
}
