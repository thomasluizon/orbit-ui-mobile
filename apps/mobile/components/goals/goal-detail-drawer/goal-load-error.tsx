import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { createStyles } from './styles'

type GoalDetailStyles = ReturnType<typeof createStyles>

interface GoalLoadErrorProps {
  onRetry: () => void
  styles: GoalDetailStyles
}

/** Detail-fetch failure notice with a retry affordance; the drawer keeps
 *  rendering the cached list data underneath. */
export function GoalLoadError({ onRetry, styles }: Readonly<GoalLoadErrorProps>) {
  const { t } = useTranslation()

  return (
    <View>
      <Text style={styles.warningText}>{t('goals.detail.loadError')}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t('common.retry')}
        style={({ pressed }) => [
          styles.retryButton,
          pressed ? styles.retryButtonPressed : null,
        ]}
      >
        <Text style={styles.retryText}>{t('common.retry')}</Text>
      </Pressable>
    </View>
  )
}
