import { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { WifiOff } from 'lucide-react-native'
import { useAppTheme } from '@/lib/use-app-theme'

interface OfflineUnavailableStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
  disabled?: boolean
}

export function OfflineUnavailableState({
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  disabled = false,
}: Readonly<OfflineUnavailableStateProps>) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  return (
    <View
      style={[styles.container, compact ? styles.compactContainer : styles.cardContainer]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${title}. ${description}`}
    >
      <View
        style={[styles.iconWrap, compact ? styles.compactIconWrap : null]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <WifiOff size={compact ? 14 : 18} color={colors.textMuted} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, compact ? styles.compactTitle : null]}>{title}</Text>
        <Text style={[styles.description, compact ? styles.compactDescription : null]}>{description}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity
            style={[styles.button, disabled ? styles.buttonDisabled : null]}
            onPress={onAction}
            activeOpacity={0.8}
            disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityHint={
            disabled
              ? `${actionLabel} is unavailable while offline`
              : description
          }
          accessibilityState={{ disabled }}
        >
            <Text style={styles.buttonText}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  )
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderRadius: 16,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      gap: 10,
    },
    cardContainer: {
      padding: 14,
    },
    compactContainer: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
    },
    iconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
      marginTop: 1,
    },
    compactIconWrap: {
      width: 22,
      height: 22,
      borderRadius: 11,
    },
    content: {
      flex: 1,
      gap: 6,
    },
    title: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    compactTitle: {
      fontSize: 12,
    },
    description: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 17,
    },
    compactDescription: {
      fontSize: 11,
      lineHeight: 15,
    },
    button: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderEmphasis,
      backgroundColor: colors.surfaceElevated,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textPrimary,
    },
  })
}
