'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { StreakCard as StreakCardData } from '@orbit/shared/types/chat'
import { buildStreakWeekDays, getGamificationLevelTitleKey, xpRequiredForLevel } from '@orbit/shared/utils'
import { DayStrip } from '@/components/dates/day-strip'
import { AchievementMark } from '@/components/gamification/achievement-mark'
import { useProfile } from '@/hooks/use-profile'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { ProgressBar } from '@/components/ui/progress-bar'

export function StreakCard({ streakCard }: Readonly<{ streakCard: StreakCardData }>) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const { profile } = useProfile()
  const days = buildStreakWeekDays(streakCard, streakCard.currentStreak, streakCard.isFrozenToday, new Date(), 14, profile?.timeZone)
  const words = {
    active: t('progressScreen.streak.active'), frozen: t('progressScreen.streak.frozen'),
    missed: t('progressScreen.streak.missed'), today: t('progressScreen.streak.today'),
  }
  const discs = (streakCard.achievementDiscs ?? streakCard.recentAchievements).slice(0, 6)
  const number = new Intl.NumberFormat(locale)
  const currentLevelXp = xpRequiredForLevel(streakCard.level)
  return <div className="mt-2 w-full md:max-w-[65ch]">
    <BlockFrame state="resting" title={t('chat.streakCard.title')} count={null}
      body={<div className="flex flex-col gap-2"><DayStrip scope="account" days={days.map((day) => day.status)} labels={days.map((day) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(day.date))} words={words} label={t('chat.streakCard.days')} /><p className="text-xs text-[var(--fg-3)]">{Object.values(words).join(' · ')}</p></div>}
      items={[
        { id: 'streak', label: t('chat.streakCard.current'), control: <span className="tabular-nums text-[var(--fg-1)]">{number.format(streakCard.currentStreak)}</span> },
        { id: 'level', label: <div className="flex flex-col gap-2">{t('progressScreen.achievements.level', { level: streakCard.level, title: t(getGamificationLevelTitleKey(streakCard.level)) })}<ProgressBar value={streakCard.totalXp - currentLevelXp} max={streakCard.xpForNextLevel - currentLevelXp} label={t('progressScreen.achievements.xpProgress')} /></div>, control: <span className="tabular-nums text-[var(--fg-2)]">{t('chat.streakCard.xp', { current: number.format(streakCard.totalXp), next: number.format(streakCard.xpForNextLevel) })}</span> },
        ...discs.map((disc) => ({ id: disc.id, label: t(`gamification.achievements.${disc.id}.name`), control: <AchievementMark achievement={{ iconKey: disc.iconKey, isEarned: disc.earnedAt != null }} name={t(`gamification.achievements.${disc.id}.name`)} /> })),
      ]}
      actions={(
        /* eslint-disable-next-line local/max-button-words -- #681 uses the approved Progress destination chip. */
        <Button variant="ghost" size="sm" onClick={() => router.push('/progress')}>{t('chat.streakCard.open')}</Button>
      )} />
  </div>
}
