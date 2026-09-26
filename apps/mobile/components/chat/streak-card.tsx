import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'
import type { StreakCard as StreakCardData } from '@orbit/shared/types/chat'
import { buildStreakWeekDays, getGamificationLevelTitleKey } from '@orbit/shared/utils'
import { DayStrip } from '@/components/dates/day-strip'
import { AchievementMark } from '@/components/gamification/achievement-mark'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function StreakCard({ streakCard }: Readonly<{ streakCard: StreakCardData }>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const days = buildStreakWeekDays(streakCard, streakCard.currentStreak, streakCard.isFrozenToday, new Date(), 14)
  const words = {
    active: t('progressScreen.streak.active'), frozen: t('progressScreen.streak.frozen'),
    missed: t('progressScreen.streak.missed'), today: t('progressScreen.streak.today'),
  }
  const discs = (streakCard.achievementDiscs ?? streakCard.recentAchievements).slice(0, 6)
  const number = new Intl.NumberFormat(i18n.language)
  const figure = (value: number) => <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16 }}>{number.format(value)}</Text>
  return <View style={{ width: '100%', marginTop: 8 }}>
    <BlockFrame state="resting" title={t('chat.streakCard.title')} count={null}
      body={<View style={{ gap: 8 }}><DayStrip scope="account" days={days.map((day) => day.status)} labels={days.map((day) => new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(day.date))} words={words} label={t('chat.streakCard.days')} /><Text style={{ color: tokens.fg3, fontSize: 12 }}>{Object.values(words).join(' · ')}</Text></View>}
      items={[
        { id: 'streak', label: t('chat.streakCard.current'), control: figure(streakCard.currentStreak) },
        { id: 'level', label: <View style={{ gap: 8 }}><Text style={{ color: tokens.fg1, fontSize: 14 }}>{t('progressScreen.achievements.level', { level: streakCard.level, title: t(getGamificationLevelTitleKey(streakCard.level)) })}</Text><ProgressBar value={streakCard.totalXp} max={streakCard.xpForNextLevel} label={t('progressScreen.achievements.xpProgress')} /></View>, control: <Text style={{ color: tokens.fg2, fontSize: 12 }}>{t('chat.streakCard.xp', { current: number.format(streakCard.totalXp), next: number.format(streakCard.xpForNextLevel) })}</Text> },
        ...discs.map((disc) => ({ id: disc.id, label: t(`gamification.achievements.${disc.id}.name`), control: <AchievementMark achievement={{ iconKey: disc.iconKey, isEarned: disc.earnedAt != null }} name={t(`gamification.achievements.${disc.id}.name`)} tokens={tokens} /> })),
      ]}
      actions={(
        /* eslint-disable-next-line local/max-button-words -- #681 uses the approved Progress destination chip. */
        <Button variant="ghost" size="sm" onClick={() => router.push('/progress')}>{t('chat.streakCard.open')}</Button>
      )} />
  </View>
}
