import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import type { AppTokensV2 } from '@/lib/theme'

export function StreakFigure({ currentStreak, tokens }: Readonly<{ currentStreak: number; tokens: AppTokensV2 }>) {
  const { t, i18n } = useTranslation()
  return (
    <View testID="progress-streak-figure" style={styles.streakFigure}><Text style={[styles.streak, { color: tokens.fg1 }]}>{new Intl.NumberFormat(i18n.language).format(currentStreak)}</Text><Text style={[styles.streakLabel, { color: tokens.fg2 }]}>{t('progressScreen.streak.currentLabel', { count: currentStreak })}</Text></View>
  )
}

const styles = StyleSheet.create({
  streakFigure: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  streakLabel: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 24 },
  streak: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 60, fontVariant: ['tabular-nums'], lineHeight: 60, letterSpacing: -1.8 },
})
