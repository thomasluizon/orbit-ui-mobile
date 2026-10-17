import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'
import type { StreakCard as StreakCardData } from '@orbit/shared/types/chat'
import { buildStreakWeekDays, getGamificationLevelTitleKey, xpRequiredForLevel, buildProtectedDayLabels, getStreakTierLabelKey } from '@orbit/shared/utils'
import { DayStrip } from '@/components/dates/day-strip'
import { AchievementMark } from '@/components/gamification/achievement-mark'
import { useProfile } from '@/hooks/use-profile'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { FreezeBank } from '@/components/ui/freeze-bank'
import { useStreakFreeze } from '@/hooks/use-gamification'
import { liveBlockState } from '@orbit/shared/chat/live-block-state'
import { ProgressBar } from '@/components/ui/progress-bar'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function StreakCard({ streakCard }: Readonly<{ streakCard: StreakCardData }>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { profile } = useProfile()
  const freeze = useStreakFreeze(null, profile?.timeZone ?? null)
  const liveStreak = freeze.streakInfo ?? streakCard
  const frameState = liveBlockState(freeze.streakQuery, { staleMessage: t('chat.liveBlock.stale'), onRefresh: () => { void freeze.streakQuery.refetch() } })
  const days = buildStreakWeekDays(liveStreak, liveStreak.currentStreak, liveStreak.isFrozenToday, new Date(), 14, profile?.timeZone)
  const words = {
    active: t('progressScreen.streak.active'), frozen: t('progressScreen.streak.frozen'),
    missed: t('progressScreen.streak.missed'), today: t('progressScreen.streak.today'),
  }
  const discs = (streakCard.achievementDiscs ?? streakCard.recentAchievements).slice(0, 6)
  const number = new Intl.NumberFormat(i18n.language)
  const currentLevelXp = xpRequiredForLevel(streakCard.level)
  const figure = (value: number) => <Text style={{ color: tokens.fg1, fontFamily: 'SpaceGrotesk_500Medium', fontSize: 16, fontVariant: ['tabular-nums'] }}>{number.format(value)}</Text>
  return <View style={{ width: '100%' }}>
    <BlockFrame {...frameState} title={t('chat.streakCard.title')} count={null}
      body={<View style={{ gap: 8 }}><DayStrip scope="account" days={days.map((day) => day.status)} labels={days.map((day) => new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(day.date))} words={words} label={t('chat.streakCard.days')} /><Text style={{ color: tokens.fg3, fontSize: 12 }}>{Object.values(words).join(' · ')}</Text>{freeze.streakInfo ? <FreezeBank
        banked={freeze.streakFreezesAccumulated} ceiling={freeze.maxStreakFreezesAccumulated} usedThisMonth={freeze.freezesUsedThisMonth}
        longestValue={liveStreak.longestStreak} longestLabel={t('progressScreen.streak.longest')}
        daysTowardNext={Math.max(0, 7 - freeze.daysUntilNextFreeze)} earnRateDays={7}
        tierValue={t(getStreakTierLabelKey(liveStreak.currentStreak))} tierLabel={t('streakDisplay.detail.tierTileLabel')}
        protectedDays={buildProtectedDayLabels(freeze.streakInfo.recentFreezeDates, i18n.language, freeze.isFrozenToday, profile?.timeZone ?? undefined)}
        words={{ ...words, legendLabel: t('progressScreen.streak.legend'), bankedLabel: t('progressScreen.streak.banked'), usedLabel: t('progressScreen.streak.used'), nextLabel: t('progressScreen.streak.next'), nextProgressLabel: t('progressScreen.streak.nextProgress'), nextFreezeProgress: t('progressScreen.streak.nextOf', { current: Math.max(0, 7 - freeze.daysUntilNextFreeze), total: 7 }), protectedLabel: t('progressScreen.streak.protectedDays'), protectedEmpty: t('progressScreen.streak.protectedEmpty'), protectedDay: t('progressScreen.streak.protected'), protectedToday: t('progressScreen.streak.protectedToday') }} /> : null}</View>}
      items={[
        { id: 'streak', label: t('chat.streakCard.current'), control: figure(liveStreak.currentStreak) },
        { id: 'level', label: <View style={{ gap: 8 }}><Text style={{ color: tokens.fg1, fontSize: 14 }}>{t('progressScreen.achievements.level', { level: streakCard.level, title: t(getGamificationLevelTitleKey(streakCard.level)) })}</Text><ProgressBar value={streakCard.totalXp - currentLevelXp} max={streakCard.xpForNextLevel - currentLevelXp} label={t('progressScreen.achievements.xpProgress')} /></View>, control: <Text style={{ color: tokens.fg2, fontSize: 12 }}>{t('chat.streakCard.xp', { current: number.format(streakCard.totalXp), next: number.format(streakCard.xpForNextLevel) })}</Text> },
        ...discs.map((disc) => ({ id: disc.id, label: t(`gamification.achievements.${disc.id}.name`), control: <AchievementMark achievement={{ iconKey: disc.iconKey, isEarned: disc.earnedAt != null }} name={t(`gamification.achievements.${disc.id}.name`)} tokens={tokens} /> })),
      ]}
      actions={(
        <>
        {freeze.streakQuery.isError ? <Text accessibilityRole="alert" style={{ color: tokens.statusBadText, fontSize: 14 }}>{t('chat.liveBlock.error')}</Text> : null}
        {/* eslint-disable-next-line local/max-button-words -- #681 uses the approved Progress destination chip. */}
        <Button variant="ghost" size="sm" onClick={() => router.push('/progress/streak')}>{t('chat.streakCard.open')}</Button>
        </>
      )} />
  </View>
}
