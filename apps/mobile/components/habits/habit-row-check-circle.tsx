import { useEffect, useRef } from 'react'
import { Pressable } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated'
import { Check } from 'lucide-react-native'
import { usePrefersReducedMotion } from '@/lib/motion'
import type { createTokensV2 } from '@/lib/theme'
import type { StatusDotState } from '@/components/ui/status-dot'
import { styles } from './habit-row-styles'

const CHECK_FILLED_STATES: ReadonlySet<StatusDotState> = new Set([
  'done',
  'skip',
  'frozen',
])

interface CheckCircleProps {
  state: StatusDotState
  /** 'bad' fills the logged circle in statusBad instead of statusDone. */
  tone?: 'default' | 'bad'
  onToggle: () => void
  disabled: boolean
  accessibilityLabel: string
  tokens: ReturnType<typeof createTokensV2>
}

export function CheckCircle({
  state,
  tone = 'default',
  onToggle,
  disabled,
  accessibilityLabel,
  tokens,
}: Readonly<CheckCircleProps>) {
  const colorMap: Record<StatusDotState, string> = {
    done: tokens.statusDone,
    empty: tokens.statusEmpty,
    skip: tokens.statusSkip,
    overdue: tokens.statusOverdue,
    bad: tokens.statusBad,
    frozen: tokens.statusFrozen,
  }
  const filled = CHECK_FILLED_STATES.has(state)
  const color =
    tone === 'bad' && state === 'done' ? tokens.statusBad : colorMap[state]

  const prefersReducedMotion = usePrefersReducedMotion()
  const popScale = useSharedValue(1)
  const previousFilled = useRef(filled)

  useEffect(() => {
    if (filled && !previousFilled.current && !prefersReducedMotion) {
      popScale.value = withSequence(
        withSpring(1.18, { damping: 14 }),
        withSpring(1),
      )
    }
    previousFilled.current = filled
  }, [filled, popScale, prefersReducedMotion])

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: popScale.value }],
  }))

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed && !disabled ? 0.9 : 1 }],
      })}
    >
      <Animated.View
        style={[
          styles.checkCircle,
          {
            backgroundColor: filled ? color : 'transparent',
            borderWidth: filled ? 0 : 2,
            borderColor: filled ? 'transparent' : color,
          },
          filled && state === 'done'
            ? {
                shadowColor: tone === 'bad' ? tokens.statusBad : tokens.primary,
                shadowOpacity: 0.35,
                shadowRadius: 7,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }
            : null,
          popStyle,
        ]}
      >
        {filled ? (
          <Check size={17} color={tokens.fgOnPrimary} strokeWidth={3} />
        ) : null}
      </Animated.View>
    </Pressable>
  )
}
