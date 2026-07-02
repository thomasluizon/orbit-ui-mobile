import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ReviewReminderCardProps {
  onRate: () => void
  onDismiss: () => void
}

/**
 * Review reminder card: quiet bg-card strip with the prompt text and
 * Rate / Later actions on the right.
 */
export function ReviewReminderCard({
  onRate,
  onDismiss,
}: Readonly<ReviewReminderCardProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])

  return (
    <View style={styles.card}>
      <Text style={styles.text}>{t('reviewPrompt.title')}</Text>
      <View style={styles.actions}>
        <Pressable
          onPress={onRate}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('reviewPrompt.cta')}
          style={({ pressed }) => [pressed ? styles.actionPressed : null]}
        >
          <Text style={styles.rateText}>{t('reviewPrompt.cta')}</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.later')}
          style={({ pressed }) => [pressed ? styles.actionPressed : null]}
        >
          <Text style={styles.laterText}>{t('common.later')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgCard,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    text: {
      flex: 1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 19,
      color: tokens.fg1,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    actionPressed: {
      opacity: 0.7,
    },
    rateText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 14,
      color: tokens.primary,
      paddingVertical: 8,
    },
    laterText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg3,
      paddingVertical: 8,
    },
  })
}
