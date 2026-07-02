import { Text, TouchableOpacity, View } from 'react-native'
import { ChevronRight, Orbit } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { AppTokens, createStyles } from './styles'

type GoalDetailStyles = ReturnType<typeof createStyles>

interface GoalAskAstraButtonProps {
  tokens: AppTokens
  styles: GoalDetailStyles
  onPress: () => void
}

export function GoalAskAstraButton({
  tokens,
  styles,
  onPress,
}: Readonly<GoalAskAstraButtonProps>) {
  const { t } = useTranslation()
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('goals.detail.askAstraEyebrow')}: ${t('goals.detail.askAstraDefault')}`}
      style={styles.askAstra}
    >
      <View style={styles.askAstraWell}>
        <Orbit size={15} color={tokens.primary} strokeWidth={1.9} />
      </View>
      <View style={styles.askAstraContent}>
        <Text style={styles.askAstraEyebrowText}>
          {t('goals.detail.askAstraEyebrow')}
        </Text>
        <Text style={styles.askAstraBody}>
          {t('goals.detail.askAstraDefault')}
        </Text>
      </View>
      <ChevronRight size={16} color={tokens.fg3} strokeWidth={1.7} />
    </TouchableOpacity>
  )
}
