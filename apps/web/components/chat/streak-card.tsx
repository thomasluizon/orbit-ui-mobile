'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
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

export function StreakCard({ streakCard }: Readonly<{ streakCard: StreakCardData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
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
  const number = new Intl.NumberFormat(locale)
  const currentLevelXp = xpRequiredForLevel(streakCard.level)
  return <div className="w-full">
    <BlockFrame {...frameState} title={t('chat.streakCard.title')} count={null}
      body={<div className="flex flex-col gap-2"><DayStrip scope="account" days={days.map((day) => day.status)} labels={days.map((day) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(day.date))} words={words} label={t('chat.streakCard.days')} /><p className="text-xs text-[var(--fg-3)]">{Object.values(words).join(' · ')}</p>{freeze.streakInfo ? <FreezeBank
        banked={freeze.streakFreezesAccumulated} ceiling={freeze.maxStreakFreezesAccumulated} usedThisMonth={freeze.freezesUsedThisMonth}
        longestValue={liveStreak.longestStreak} longestLabel={t('progressScreen.streak.longest')}
        daysTowardNext={Math.max(0, 7 - freeze.daysUntilNextFreeze)} earnRateDays={7}
        tierValue={t(getStreakTierLabelKey(liveStreak.currentStreak))} tierLabel={t('streakDisplay.detail.tierTileLabel')}
        protectedDays={buildProtectedDayLabels(freeze.streakInfo.recentFreezeDates, locale, freeze.isFrozenToday, profile?.timeZone ?? undefined)}
        words={{ ...words, legendLabel: t('progressScreen.streak.legend'), bankedLabel: t('progressScreen.streak.banked'), usedLabel: t('progressScreen.streak.used'), nextLabel: t('progressScreen.streak.next'), nextProgressLabel: t('progressScreen.streak.nextProgress'), nextFreezeProgress: t('progressScreen.streak.nextOf', { current: Math.max(0, 7 - freeze.daysUntilNextFreeze), total: 7 }), protectedLabel: t('progressScreen.streak.protectedDays'), protectedEmpty: t('progressScreen.streak.protectedEmpty'), protectedDay: t('progressScreen.streak.protected'), protectedToday: t('progressScreen.streak.protectedToday') }} /> : null}</div>}
      items={[
        { id: 'streak', label: t('chat.streakCard.current'), control: <span className="tabular-nums text-[var(--fg-1)]">{number.format(liveStreak.currentStreak)}</span> },
        { id: 'level', label: <div className="flex flex-col gap-2">{t('progressScreen.achievements.level', { level: streakCard.level, title: t(getGamificationLevelTitleKey(streakCard.level)) })}<ProgressBar value={streakCard.totalXp - currentLevelXp} max={streakCard.xpForNextLevel - currentLevelXp} label={t('progressScreen.achievements.xpProgress')} /></div>, control: <span className="tabular-nums text-[var(--fg-2)]">{t('chat.streakCard.xp', { current: number.format(streakCard.totalXp), next: number.format(streakCard.xpForNextLevel) })}</span> },
        ...discs.map((disc) => ({ id: disc.id, label: t(`gamification.achievements.${disc.id}.name`), control: <AchievementMark achievement={{ iconKey: disc.iconKey, isEarned: disc.earnedAt != null }} name={t(`gamification.achievements.${disc.id}.name`)} /> })),
      ]}
      actions={(
        <>
        {freeze.streakQuery.isError ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t('chat.liveBlock.error')}</p> : null}
        {/* eslint-disable-next-line local/max-button-words -- #681 uses the approved Progress destination chip. */}
        <Button variant="ghost" size="sm" onClick={() => router.push('/progress/streak')}>{t('chat.streakCard.open')}</Button>
        </>
      )} />
  </div>
}
