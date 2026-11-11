import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import { useState } from 'react'
import Animated from 'react-native-reanimated'
import { motionDurations, motionEasings, orbitalMotion } from '@orbit/shared/theme'
import { triggerHaptic } from '@/lib/haptics'
import { usePrefersReducedMotion } from '@/lib/motion'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import { HabitCheck } from './habit-check'

interface CheckCircleProps {
  state: HabitStatus
  unavailable?: boolean
  onToggle: () => void
  disabled: boolean
  accessibilityLabel: string
  accessibilityHint?: string
}

export function CheckCircle({
  state,
  unavailable = false,
  onToggle,
  disabled,
  accessibilityLabel,
  accessibilityHint,
}: Readonly<CheckCircleProps>) {
  const [hovered, setHovered] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  return (
    <Pressable
      onPress={() => {
        if (disabled) return
        onToggle()
        if (state !== 'done') void triggerHaptic('selection')
      }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      disabled={disabled}
      hitSlop={0}
      focusInset={(48 - 28) / 2}
      focusOffset={2}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={disabled ? accessibilityHint : undefined}
      accessibilityState={{ disabled }}
      style={{
        width: 48,
        minHeight: 48,
        borderRadius: 12,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {({ pressed }) => <Animated.View style={{
        transform: [{ scale: pressed && !disabled && !prefersReducedMotion ? orbitalMotion.press.scale : 1 }],
        transition: prefersReducedMotion ? 'none' : `transform ${motionDurations.press}ms cubic-bezier(${motionEasings.standard.join(',')})`,
      }}>
        <HabitCheck status={state} unavailable={unavailable} label={unavailable ? undefined : accessibilityLabel}
          feedback={(pressed || hovered) && !disabled} />
      </Animated.View>}
    </Pressable>
  )
}
