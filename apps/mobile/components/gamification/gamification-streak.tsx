import { useTranslation } from 'react-i18next'
import { Text, View, useWindowDimensions } from 'react-native'
import type { GamificationCard } from '@orbit/shared/types/chat'
import { gamificationStreakPresentation } from '@orbit/shared/chat/gamification-card-core'
import { DayStrip } from '@/components/dates/day-strip'
import { FreezeBank } from '@/components/ui/freeze-bank'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { StreakFigure } from './streak-figure'

export function GamificationStreak({ streak, read, showHeading }: Readonly<{ streak: NonNullable<GamificationCard['state']['streak']>; read: GamificationCard['read']; showHeading: boolean }>) {
  const { t, i18n } = useTranslation()
  const { width } = useWindowDimensions()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const presentation = gamificationStreakPresentation(streak, read, i18n.language, t)
  return <View style={{ minWidth: 0, gap: 16 }}>
    {showHeading ? <Text accessibilityRole="header" style={{ fontSize: 16, fontFamily: 'Geist_500Medium', color: tokens.fg1 }}>{t('progressScreen.sections.streak')}</Text> : null}
    <StreakFigure currentStreak={streak.currentStreak} tokens={tokens} />
    <DayStrip size={width >= 768 ? 24 : 20} scope="account" days={presentation.days.map(day => day.status)} labels={presentation.labels} words={presentation.dayWords} label={presentation.stripLabel} />
    <FreezeBank {...presentation.freeze} />
  </View>
}
