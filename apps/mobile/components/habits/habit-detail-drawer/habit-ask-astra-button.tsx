import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Orbit } from '@/components/ui/icons'
import type { createTokensV2 } from '@/lib/theme'
import type { createDrawerStyles } from './styles'

interface HabitAskAstraButtonProps {
  tokens: ReturnType<typeof createTokensV2>
  styles: ReturnType<typeof createDrawerStyles>
  askPrompt: string
  onPress: () => void
}

export function HabitAskAstraButton({
  tokens,
  styles,
  askPrompt,
  onPress,
}: Readonly<HabitAskAstraButtonProps>) {
  const { t } = useTranslation()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('habits.detail.askAstraEyebrow')}: ${askPrompt}`}
      style={({ pressed }) => [
        styles.askAstra,
        pressed ? styles.askAstraPressed : null,
      ]}
    >
      <View style={styles.askAstraContent}>
        <View style={styles.askAstraEyebrow}>
          <Orbit size={12} color={tokens.primary} strokeWidth={1.7} />
          <Text
            style={[
              styles.askAstraEyebrowText,
              { color: tokens.fg3 },
            ]}
          >
            {t('habits.detail.askAstraEyebrow')}
          </Text>
        </View>
        <Text style={[styles.askAstraBody, { color: tokens.fg2 }]}>
          {askPrompt}
        </Text>
      </View>
      <ChevronRight size={16} color={tokens.fg3} strokeWidth={1.7} />
    </Pressable>
  )
}
