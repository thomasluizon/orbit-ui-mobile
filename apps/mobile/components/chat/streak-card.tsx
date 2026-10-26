import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import type { StreakCard as StreakCardData } from '@orbit/shared/types/chat'
import { buildStreakWeekDays, getGamificationLevelTitleKey, xpRequiredForLevel } from '@orbit/shared/utils'
import { DayStrip } from '@/components/dates/day-strip'
import { AchievementMark } from '@/components/gamification/achievement-mark'
import { useProfile } from '@/hooks/use-profile'
import { BlockFrame } from './read-block-frame'
import { CompactFigure } from './compact-figure'
import { useStreakFreeze } from '@/hooks/use-gamification'
import { formatReadWindow, readBlockWindow } from '@orbit/shared/chat/read-block-core'
import { liveBlockState } from '@orbit/shared/chat/live-block-state'
import { ProgressBar } from '@/components/ui/progress-bar'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function StreakCard({ streakCard }: Readonly<{ streakCard: StreakCardData }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { profile } = useProfile()
  const freeze = useStreakFreeze(null, profile?.timeZone ?? null)
  const liveStreak = streakCard
  const frameState = liveBlockState(freeze.streakQuery, { staleMessage: t('chat.liveBlock.stale'), onRefresh: () => { void freeze.streakQuery.refetch() } })
  const window = streakCard.read ? readBlockWindow(streakCard.read.scope) : null
  const asOf = window ? new Date(`${window.to}T12:00:00Z`) : new Date()
  const days = buildStreakWeekDays(liveStreak, liveStreak.currentStreak, liveStreak.isFrozenToday, asOf, 14, window ? 'UTC' : profile?.timeZone)
  const words = {
    active: t('progressScreen.streak.active'), frozen: t('progressScreen.streak.frozen'),
    missed: t('progressScreen.streak.missed'), today: window ? formatReadWindow({ from: window.to, to: window.to }, i18n.language) : t('progressScreen.streak.today'),
  }
  const discs = (streakCard.achievementDiscs ?? streakCard.recentAchievements).slice(0, 6)
  const number = new Intl.NumberFormat(i18n.language)
  const currentLevelXp = xpRequiredForLevel(streakCard.level)
  return <View style={{ width: '100%' }}>
    <BlockFrame {...frameState} title={t('chat.streakCard.title')} count={null}
      body={<View style={{ gap: 8 }}><CompactFigure value={number.format(liveStreak.currentStreak)} unit={t('chat.readBlock.unit.days', { count: liveStreak.currentStreak })} /><DayStrip scope="account" days={days.map((day) => day.status)} labels={days.map((day) => new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(day.date))} words={words} label={t('chat.streakCard.days')} /><Text style={{ color: tokens.fg3, fontSize: 12 }}>{Object.values(words).join(' · ')}</Text></View>}
      items={[
        { id: 'level', label: <View style={{ gap: 8 }}><Text style={{ color: tokens.fg1, fontSize: 14 }}>{t('progressScreen.achievements.level', { level: streakCard.level, title: t(getGamificationLevelTitleKey(streakCard.level)) })}</Text><ProgressBar value={streakCard.totalXp - currentLevelXp} max={streakCard.xpForNextLevel - currentLevelXp} label={t('progressScreen.achievements.xpProgress')} /></View>, control: <Text style={{ color: tokens.fg2, fontSize: 12 }}>{t('chat.streakCard.xp', { current: number.format(streakCard.totalXp), next: number.format(streakCard.xpForNextLevel) })}</Text> },
        ...discs.map((disc) => ({ id: disc.id, label: t(`gamification.achievements.${disc.id}.name`), control: <AchievementMark achievement={{ iconKey: disc.iconKey, isEarned: disc.earnedAt != null }} name={t(`gamification.achievements.${disc.id}.name`)} tokens={tokens} /> })),
      ]}
      actions={(
        <>
        {freeze.streakQuery.isError ? <Text accessibilityRole="alert" style={{ color: tokens.statusBadText, fontSize: 14 }}>{t('chat.liveBlock.error')}</Text> : null}
        </>
      )} />
  </View>
}
