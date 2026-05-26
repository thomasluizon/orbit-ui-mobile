import { Pressable, StyleSheet, Text } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
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
 * v8 MonoToggle: monospaced ON/OFF pill, hairline ring inactive, fg1 fill when on.
 * Used inside `SettingsRow` slot for binary settings (push notifications,
 * memory, auto-sync, etc.).
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
          borderColor: on ? tokens.fg1 : tokens.hairlineStrong,
          backgroundColor: on ? tokens.fg1 : 'transparent',
          opacity: pressed && onPress && !disabled ? 0.75 : disabled ? 0.55 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: on ? tokens.bg : tokens.fg2 },
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'GeistMono',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
})
