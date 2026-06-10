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
 * v8 review reminder edge banner: hairline-divided strip with quiet text
 * and Rate / Later links on the right.
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
    <View style={styles.banner}>
      <Text style={styles.text}>{t('reviewPrompt.title')}</Text>
      <View style={styles.actions}>
        <Pressable onPress={onRate} hitSlop={6}>
          <Text style={styles.rateText}>{t('reviewPrompt.cta')}</Text>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={6}>
          <Text style={styles.laterText}>{t('common.later')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: tokens.hairline,
      paddingHorizontal: 14,
      paddingVertical: 8,
      gap: 12,
      marginBottom: 16,
    },
    text: {
      flex: 1,
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg1,
    },
    actions: {
      flexDirection: 'row',
      gap: 14,
    },
    rateText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg1,
      textDecorationLine: 'underline',
      paddingVertical: 4,
    },
    laterText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
      paddingVertical: 4,
    },
  })
}
