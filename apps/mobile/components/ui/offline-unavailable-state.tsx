import { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { WifiOff } from 'lucide-react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

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
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])

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
        <WifiOff size={compact ? 14 : 18} color={tokens.fg3} />
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

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 16,
      backgroundColor: tokens.bgElev,
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
      backgroundColor: tokens.bgElev,
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
      color: tokens.fg1,
    },
    compactTitle: {
      fontSize: 12,
    },
    description: {
      fontSize: 12,
      color: tokens.fg2,
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
      borderColor: tokens.hairlineStrong,
      backgroundColor: tokens.bgElev,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: 12,
      fontWeight: '700',
      color: tokens.fg1,
    },
  })
}
