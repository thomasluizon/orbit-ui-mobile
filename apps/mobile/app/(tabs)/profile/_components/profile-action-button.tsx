import { useMemo, type ReactNode } from 'react'
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native'
import { createColors } from '@/lib/theme'

type AppColors = ReturnType<typeof createColors>

interface ProfileActionButtonProps {
  colors: AppColors
  icon: ReactNode
  label: string
  onPress: () => void
  tone?: 'default' | 'primary' | 'danger'
  compact?: boolean
}

export function ProfileActionButton({
  colors,
  icon,
  label,
  onPress,
  tone = 'default',
  compact = false,
}: ProfileActionButtonProps) {
  const styles = useMemo(() => createProfileActionButtonStyles(colors), [colors])
  const toneStyle =
    tone === 'danger'
      ? compact
        ? styles.dangerCompact
        : styles.danger
      : tone === 'primary'
        ? styles.primary
        : styles.default

  return (
    <TouchableOpacity
      style={[styles.button, toneStyle]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.7}
    >
      <View style={styles.icon}>{icon}</View>
      <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
    </TouchableOpacity>
  )
}

function createProfileActionButtonStyles(colors: AppColors) {
  return StyleSheet.create({
    button: {
      width: '100%',
      borderRadius: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    default: {
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      backgroundColor: colors.surface,
    },
    primary: {
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: colors.primary_30,
      backgroundColor: colors.primary_10,
    },
    danger: {
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: colors.red400_10,
      backgroundColor: colors.surface,
    },
    dangerCompact: {
      paddingVertical: 14,
      backgroundColor: colors.surface,
    },
    icon: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    labelCompact: {
      fontSize: 12,
      color: colors.red400,
    },
  })
}
