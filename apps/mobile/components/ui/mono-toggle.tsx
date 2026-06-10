import { Pressable, StyleSheet, Text } from 'react-native'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface MonoToggleProps {
  on: boolean
  onPress?: () => void
  disabled?: boolean
  accessibilityLabel?: string
  /** Text shown when on. Default "ON". */
  onLabel?: string
  /** Text shown when off. Default "OFF". */
  offLabel?: string
}

/**
 * Kit toggle pill: bg-field fill, primary 0.12 tint + primary text when on,
 * fg-3 text when off. Used inside `SettingsRow` slot for binary settings
 * (push notifications, memory, auto-sync, etc.).
 */
export function MonoToggle({
  on,
  onPress,
  disabled = false,
  accessibilityLabel,
  onLabel = 'ON',
  offLabel = 'OFF',
}: Readonly<MonoToggleProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on, disabled }}
      style={({ pressed }) => [
        styles.toggle,
        {
          backgroundColor: on ? tintFromPrimary(tokens, 0.12) : tokens.bgField,
          opacity: pressed && onPress && !disabled ? 0.75 : disabled ? 0.55 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: on ? tokens.primary : tokens.fg3 },
        ]}
      >
        {on ? onLabel : offLabel}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  toggle: {
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
})
