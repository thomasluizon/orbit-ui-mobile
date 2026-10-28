import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import { useState } from 'react'
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
      style={({ pressed }) => {
        return {
          width: 48,
          minHeight: 48,
          borderRadius: 12,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
          opacity: disabled ? 0.4 : 1,
          transform: [{ scale: pressed && !disabled && !prefersReducedMotion ? 0.96 : 1 }],
        }
      }}
    >
      {({ pressed }) => <>
        <HabitCheck status={state} unavailable={unavailable} label={unavailable ? undefined : accessibilityLabel}
          feedback={(pressed || hovered) && !disabled} />
      </>}
    </Pressable>
  )
}
