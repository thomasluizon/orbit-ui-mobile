import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import type { createStyles } from './styles'

type GoalDetailStyles = ReturnType<typeof createStyles>

interface GoalLoadErrorProps {
  onRetry: () => void
  styles: GoalDetailStyles
}

/** Inline detail-fetch failure notice — the drawer keeps rendering the cached list data underneath,
 *  so this stays an inline row rather than the centred lockup, but shares its vocabulary: the neutral
 *  alert glyph, secondary body copy, and a ghost retry pill. Mirrors the web inline lockup. */
export function GoalLoadError({ onRetry, styles }: Readonly<GoalLoadErrorProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.loadError}>
      <AlertTriangle size={18} strokeWidth={1.6} color={tokens.fg3} />
      <View style={styles.loadErrorContent}>
        <Text style={styles.loadErrorText}>{t('goals.detail.loadError')}</Text>
        <PillButton
          variant="ghost"
          size="sm"
          onPress={onRetry}
          accessibilityLabel={t('common.retry')}
        >
          {t('common.retry')}
        </PillButton>
      </View>
    </View>
  )
}
