import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { WifiOff } from '@/components/ui/icons'
import { createTokensV2, radius, type AppTokensV2 } from '@/lib/theme'
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
        style={styles.iconWrap}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <WifiOff size={22} strokeWidth={1.8} color={tokens.fg3} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, compact ? styles.compactTitle : null]}>{title}</Text>
        <Text style={[styles.description, compact ? styles.compactDescription : null]}>{description}</Text>
        {actionLabel && onAction ? (
          <Pressable
            style={({ pressed }) => [
              styles.button,
              disabled ? styles.buttonDisabled : null,
              pressed && !disabled ? { opacity: 0.85 } : null,
            ]}
            onPress={onAction}
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
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: tokens.hairline,
      borderRadius: 18,
      backgroundColor: tokens.bgCard,
      flexDirection: 'row',
      gap: 14,
    },
    cardContainer: {
      padding: 16,
    },
    compactContainer: {
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    iconWrap: {
      marginTop: 1,
    },
    content: {
      flex: 1,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      color: tokens.fg1,
    },
    compactTitle: {
      fontSize: 14,
    },
    description: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13.5,
      color: tokens.fg3,
      lineHeight: 19,
      marginTop: 3,
    },
    compactDescription: {
      fontSize: 12.5,
      lineHeight: 17,
    },
    button: {
      alignSelf: 'flex-start',
      marginTop: 12,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: radius.full,
      borderWidth: 1.5,
      borderColor: tokens.hairlineStrong,
      backgroundColor: 'transparent',
    },
    buttonDisabled: {
      opacity: 0.4,
    },
    buttonText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg1,
    },
  })
}
