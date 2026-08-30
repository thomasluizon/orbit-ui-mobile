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
}

export function HabitLogButton({ label, logged, completed = logged, onPress, progress }: Readonly<HabitLogButtonProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed ? { backgroundColor: tokens.bgElevPressed, transform: [{ scale: 0.96 }] } : null]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {progress === undefined || completed ? (
          <StatusRing status={completed ? 'done' : 'empty'} size={30} label="" />
        ) : (
          <ProgressRing value={progress} size={30} label="" />
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
})
