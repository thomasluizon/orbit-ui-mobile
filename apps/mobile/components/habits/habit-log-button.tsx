import { useState } from 'react'
import { hoverForeground, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { Pressable, StyleSheet, View } from 'react-native'
import { ProgressRing } from '@/components/ui/progress-ring'
import { StatusRing } from '@/components/ui/status-ring'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitLogButtonProps {
  label: string
  completed?: boolean
  logged: boolean
  onPress: () => void
  progress?: number
  disabled?: boolean
  disabledReason?: string
}

export function HabitLogButton({ label, logged, completed = logged, onPress, progress, disabled = false, disabledReason }: Readonly<HabitLogButtonProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [pressed, setPressed] = useState(false)
  const trackColor = hoverForeground(currentTheme, tokens.trackEmpty, pressed)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled ? disabledReason : undefined}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={({ pressed }) => [styles.button, disabled ? { opacity: 0.4 } : null, pressed && !disabled ? { backgroundColor: tokens.bgHover } : null]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {progress === undefined || completed ? (
          <StatusRing trackColor={trackColor} status={completed ? 'done' : 'empty'} size={30} label="" />
        ) : (
          <ProgressRing trackColor={trackColor} value={progress} size={30} label="" />
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
})
