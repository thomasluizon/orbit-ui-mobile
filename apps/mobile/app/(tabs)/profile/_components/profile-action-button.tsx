import { Pressable, StyleSheet, Text } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ProfileActionButtonProps {
  label: string
  onPress: () => void
  tone?: 'default' | 'primary' | 'danger'
  /** Render the label in a quieter, italic style (small destructive actions). */
  compact?: boolean
}

/**
 * v8 hairline-row action button used at the bottom of the profile screen.
 * Tone controls the label color; the row otherwise matches SettingsRow.
 */
export function ProfileActionButton({
  label,
  onPress,
  tone = 'default',
  compact = false,
}: Readonly<ProfileActionButtonProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const labelColor =
    tone === 'danger'
      ? tokens.statusBad
      : tone === 'primary'
        ? tokens.primary
        : tokens.fg1

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? tokens.bgElev : 'transparent',
          borderBottomColor: tokens.hairline,
        },
      ]}
    >
      <Text
        style={[
          compact ? styles.labelCompact : styles.label,
          {
            color: labelColor,
            fontStyle: compact ? 'italic' : 'normal',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontFamily: 'Geist',
    fontSize: 15,
    fontWeight: '400',
  },
  labelCompact: {
    fontFamily: 'Geist',
    fontSize: 13,
    fontWeight: '400',
  },
})
