'use client'

import { useLocale, useTranslations } from 'next-intl'
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

export function StreakCard({ streakCard }: Readonly<{ streakCard: StreakCardData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const { profile } = useProfile()
  const freeze = useStreakFreeze(null, profile?.timeZone ?? null)
  const liveStreak = streakCard
  const frameState = liveBlockState(freeze.streakQuery, { staleMessage: t('chat.liveBlock.stale'), onRefresh: () => { void freeze.streakQuery.refetch() } })
  const window = streakCard.read ? readBlockWindow(streakCard.read.scope) : null
  const asOf = window ? new Date(`${window.to}T12:00:00Z`) : new Date()
  const days = buildStreakWeekDays(liveStreak, liveStreak.currentStreak, liveStreak.isFrozenToday, asOf, 14, window ? 'UTC' : profile?.timeZone)
  const words = {
    active: t('progressScreen.streak.active'), frozen: t('progressScreen.streak.frozen'),
    missed: t('progressScreen.streak.missed'), today: window ? formatReadWindow({ from: window.to, to: window.to }, locale) : t('progressScreen.streak.today'),
  }
  const discs = (streakCard.achievementDiscs ?? streakCard.recentAchievements).slice(0, 6)
  const number = new Intl.NumberFormat(locale)
  const currentLevelXp = xpRequiredForLevel(streakCard.level)
  return <div className="w-full">
    <BlockFrame {...frameState} title={t('chat.streakCard.title')} count={null}
      body={<div className="flex flex-col gap-2"><CompactFigure value={number.format(liveStreak.currentStreak)} unit={t('chat.readBlock.unit.days', { count: liveStreak.currentStreak })} /><DayStrip scope="account" days={days.map((day) => day.status)} labels={days.map((day) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(day.date))} words={words} label={t('chat.streakCard.days')} /><p className="text-xs text-[var(--fg-3)]">{Object.values(words).join(' · ')}</p></div>}
      items={[
        { id: 'level', label: <div className="flex flex-col gap-2">{t('progressScreen.achievements.level', { level: streakCard.level, title: t(getGamificationLevelTitleKey(streakCard.level)) })}<ProgressBar value={streakCard.totalXp - currentLevelXp} max={streakCard.xpForNextLevel - currentLevelXp} label={t('progressScreen.achievements.xpProgress')} /></div>, control: <span className="tabular-nums text-[var(--fg-2)]">{t('chat.streakCard.xp', { current: number.format(streakCard.totalXp), next: number.format(streakCard.xpForNextLevel) })}</span> },
        ...discs.map((disc) => ({ id: disc.id, label: t(`gamification.achievements.${disc.id}.name`), control: <AchievementMark achievement={{ iconKey: disc.iconKey, isEarned: disc.earnedAt != null }} name={t(`gamification.achievements.${disc.id}.name`)} /> })),
      ]}
      actions={(
        <>
        {freeze.streakQuery.isError ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{t('chat.liveBlock.error')}</p> : null}
        </>
      )} />
  </div>
}
