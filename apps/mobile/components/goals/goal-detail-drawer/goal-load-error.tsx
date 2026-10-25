import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'

import { Text, View } from 'react-native'
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
      <IconButton label={t('common.retry')} onPress={onRetry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>
    </View>
  )
}
