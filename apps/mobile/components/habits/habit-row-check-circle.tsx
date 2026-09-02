import { useEffect, useRef } from 'react'
import { Pressable } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { usePrefersReducedMotion } from '@/lib/motion'
import type { createTokensV2 } from '@/lib/theme'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import { StatusRing } from '@/components/ui/status-ring'

interface CheckCircleProps {
  state: HabitStatus
  onToggle: () => void
  disabled: boolean
  accessibilityLabel: string
  tokens: ReturnType<typeof createTokensV2>
  size?: number
}

export function CheckCircle({
  state,
  onToggle,
  disabled,
  accessibilityLabel,
  tokens,
  size = 30,
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
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => {
        const pressedOpacity = pressed ? 0.85 : 1
        return {
          width: 44,
          height: 44,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed && !disabled ? tokens.bgHover : 'transparent',
          opacity: disabled ? 0.4 : pressedOpacity,
          transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
        }
      }}
    >
      <Animated.View style={popStyle} accessible={false}>
        <StatusRing status={state} size={size} label={accessibilityLabel} />
      </Animated.View>
    </Pressable>
  )
}
