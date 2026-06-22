'use client'

import { useMemo, useRef, useEffect } from 'react'
import { buildStreakWeekDays } from '@orbit/shared/utils'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { useStreakFreeze } from '@/hooks/use-gamification'
import { useDateFormat } from '@/hooks/use-date-format'
import { StreakFreezeCelebration, type StreakFreezeCelebrationHandle } from '@/components/gamification/streak-freeze-celebration'
import { AppBar } from '@/components/ui/app-bar'
import { FreezeProgressCard, StreakStatsRow, StreakTimelineCard } from './_components/streak-sections'
import { StreakHero } from './_components/streak-hero'
import { StreakFrozenBanner } from './_components/streak-frozen-banner'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import './streak.css'

export default function StreakPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const { displayDate } = useDateFormat()
  const { profile } = useProfile()
  const streak = profile?.currentStreak ?? 0
  const isPro = profile?.hasProAccess ?? false
  const {
    streakQuery,
    streakInfo,
    isFrozenToday,
    streakFreezesAccumulated,
    maxStreakFreezesAccumulated,
    freezesUsedThisMonth,
    maxFreezesPerMonth,
  } = useStreakFreeze(profile, isPro)

  const freezeCelebrationRef = useRef<StreakFreezeCelebrationHandle>(null)
  const wasFrozenTodayRef = useRef(isFrozenToday)

  useEffect(() => {
    if (isFrozenToday && !wasFrozenTodayRef.current) {
      freezeCelebrationRef.current?.show()
    }
    wasFrozenTodayRef.current = isFrozenToday
  }, [isFrozenToday])

  const encouragement = useMemo(() => {
    if (streak >= 365) return t('streakDisplay.profile.encouragement365')
    if (streak >= 100) return t('streakDisplay.profile.encouragement100')
    if (streak >= 30) return t('streakDisplay.profile.encouragement30')
    if (streak >= 14) return t('streakDisplay.profile.encouragement14')
    if (streak >= 7) return t('streakDisplay.profile.encouragement7')
    if (streak >= 1) return t('streakDisplay.profile.encouragement1')
    return ''
  }, [streak, t])

  const weekDays = useMemo(
    () =>
      buildStreakWeekDays(streakInfo, streak, isFrozenToday).map((day) => ({
        dateStr: day.dateStr,
        dayLabel: displayDate(day.date, { weekday: 'short' }).slice(0, 3),
        dayNum: day.dayNum,
        status: day.status,
      })),
    [streakInfo, streak, isFrozenToday, displayDate],
  )

  const isLoading = streakQuery.isLoading && !streakInfo

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('streakDisplay.detail.title')}
      />

      {isLoading ? (
        <div className="flex-1 px-5 py-8 space-y-4">
          <div className="h-48 bg-[var(--bg-card)] rounded-[18px] animate-pulse" />
          <div className="h-28 bg-[var(--bg-card)] rounded-[18px] animate-pulse" />
          <div className="h-40 bg-[var(--bg-card)] rounded-[18px] animate-pulse" />
        </div>
      ) : (
        <div className="stagger-enter flex-1 min-h-0 overflow-y-auto">
          {isFrozenToday && <StreakFrozenBanner />}

          <StreakHero
            streak={streak}
            isFrozenToday={isFrozenToday}
            encouragement={encouragement}
          />

          <StreakStatsRow
            t={t}
            streak={streak}
            longestStreak={profile?.longestStreak ?? 0}
          />

          <StreakTimelineCard t={t} weekDays={weekDays} />

          <FreezeProgressCard
            t={t}
            isPro={isPro}
            streak={streak}
            streakFreezesAccumulated={streakFreezesAccumulated}
            maxStreakFreezesAccumulated={maxStreakFreezesAccumulated}
            freezesUsedThisMonth={freezesUsedThisMonth}
            maxFreezesPerMonth={maxFreezesPerMonth}
            isFrozenToday={isFrozenToday}
            streakInfo={streakInfo}
            displayDate={displayDate}
          />
        </div>
      )}

      <StreakFreezeCelebration ref={freezeCelebrationRef} />
    </div>
  )
}
