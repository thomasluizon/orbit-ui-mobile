import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { Check } from 'lucide-react-native'

interface HabitLogButtonProps {
  color: string
  done: boolean
  size?: number
  overdue?: boolean
  disabled?: boolean
  onPress: () => void
  accessibilityLabel: string
}

export function HabitLogButton({
  color,
  done,
  size = 36,
  overdue,
  disabled,
  onPress,
  accessibilityLabel,
}: Readonly<HabitLogButtonProps>) {
  const borderColor = done ? color : overdue ? 'rgba(248,113,113,0.5)' : color

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: done, disabled }}
      style={[
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor,
          backgroundColor: done ? color : 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {done && (
        <View style={styles.check}>
          <Check size={16} color="#ffffff" strokeWidth={3} />
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
