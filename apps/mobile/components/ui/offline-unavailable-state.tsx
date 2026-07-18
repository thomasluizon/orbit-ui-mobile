import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { WifiOff } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface OfflineUnavailableStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
  disabled?: boolean
}

/**
 * Inline alert shown where a capability needs a connection: a leading wifi-off glyph, the reason,
 * and an optional hugging retry pill. `compact` steps the type and padding down for use inside a
 * row or sheet rather than as a standalone block.
 */
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
      style={[styles.container, compact ? styles.compactContainer : styles.blockContainer]}
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
        <View style={styles.copy}>
          <Text style={[styles.title, compact ? styles.compactTitle : null]}>{title}</Text>
          <Text style={[styles.description, compact ? styles.compactDescription : null]}>
            {description}
          </Text>
        </View>
        {actionLabel && onAction ? (
          <PillButton
            variant="ghost"
            size="sm"
            onPress={onAction}
            disabled={disabled}
            accessibilityLabel={actionLabel}
          >
            {actionLabel}
          </PillButton>
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
      gap: 12,
      minWidth: 0,
    },
    blockContainer: {
      padding: 16,
    },
    compactContainer: {
      padding: 12,
    },
    iconWrap: {
      marginTop: 1,
    },
    content: {
      flex: 1,
      minWidth: 0,
      alignItems: 'flex-start',
      gap: 12,
    },
    copy: {
      minWidth: 0,
      gap: 4,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      lineHeight: 21,
      color: tokens.fg1,
    },
    compactTitle: {
      fontSize: 14,
      lineHeight: 18,
    },
    description: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 22,
      color: tokens.fg3,
      maxWidth: 320,
    },
    compactDescription: {
      fontSize: 12,
      lineHeight: 19,
    },
  })
}
