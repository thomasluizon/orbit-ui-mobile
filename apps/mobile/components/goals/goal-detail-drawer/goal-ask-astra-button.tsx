import { Pressable, Text, View } from 'react-native'
import { ChevronRight } from '@/components/ui/icons'
import { AstraGlyph } from '@/components/ui/astra-glyph'
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('goals.detail.askAstraEyebrow')}: ${t('goals.detail.askAstraDefault')}`}
      style={({ pressed }) => [styles.askAstra, pressed ? styles.askAstraPressed : null]}
    >
      <View style={styles.askAstraWell}>
        <AstraGlyph size={15} color={tokens.primary} />
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
    </Pressable>
  )
}
