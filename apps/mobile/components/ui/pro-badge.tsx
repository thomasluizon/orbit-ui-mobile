import { useMemo } from 'react'
import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useProfile } from '@/hooks/use-profile'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ProBadgeProps {
  /**
   * When true, the badge is always rendered regardless of the user's pro/trial status.
   * Use this for UI labels that should always show the PRO badge (e.g. locked feature headers).
   */
  alwaysVisible?: boolean
  /** Additional styles applied to the outer badge container. */
  style?: ViewStyle
  /** Additional styles applied to the badge label text. */
  textStyle?: TextStyle
  /** Override the badge label. Defaults to the i18n trial/pro label. */
  label?: string
}

export function ProBadge({ alwaysVisible = false, style, textStyle, label }: ProBadgeProps) {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  const isTrialActive = profile?.isTrialActive ?? false
  const hasProAccess = profile?.hasProAccess ?? false

  const shouldRender = alwaysVisible || isTrialActive || hasProAccess
  if (!shouldRender) return null

  const badgeLabel = label ?? (isTrialActive ? t('trial.proBadge') : t('common.proBadge'))

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: tokens.bgElev, borderColor: tokens.hairline },
        style,
      ]}
    >
      <Text style={[styles.text, { color: tokens.primary }, textStyle]}>{badgeLabel}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  text: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 10,
    letterSpacing: 0.4,
  },
})
