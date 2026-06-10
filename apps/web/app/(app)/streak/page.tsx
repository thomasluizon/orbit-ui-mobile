'use client'

import { useMemo, useRef, useEffect } from 'react'
import { subDays, isToday, format, parseISO } from 'date-fns'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile } from '@/hooks/use-profile'
import { useStreakFreeze } from '@/hooks/use-gamification'
import { useDateFormat } from '@/hooks/use-date-format'
import { StreakFreezeCelebration, type StreakFreezeCelebrationHandle } from '@/components/gamification/streak-freeze-celebration'
import { AppBar } from '@/components/ui/app-bar'
import { FreezeProgressCard, StreakTimelineCard } from './_components/streak-sections'
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

  const weekDays = useMemo(() => {
    const today = new Date()
    const freezeDates = new Set(streakInfo?.recentFreezeDates ?? [])
    const lastActive = streakInfo?.lastActiveDate
    const lastActiveDate = lastActive ? parseISO(lastActive) : null
    const currentStreak = streak

    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(today, 6 - i)
      const dateStr = format(date, 'yyyy-MM-dd')
      const dayLabel = displayDate(date, { weekday: 'short' }).slice(0, 3)
      const dayNum = String(date.getDate())
      const isTodayDate = isToday(date)

      let status: 'active' | 'frozen' | 'missed' | 'today' | 'future' = 'missed'

      if (isTodayDate) {
        if (isFrozenToday) status = 'frozen'
        else if (lastActiveDate && isToday(lastActiveDate)) status = 'active'
        else status = 'today'
      } else if (freezeDates.has(dateStr)) {
        status = 'frozen'
      } else if (lastActiveDate && currentStreak > 0) {
        const streakStart = subDays(lastActiveDate, currentStreak - 1)
        if (date >= streakStart && date <= lastActiveDate) {
          status = 'active'
        }
      }

      return { dateStr, dayLabel, dayNum, status }
    })
  }, [streakInfo, streak, isFrozenToday, displayDate])

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
          <div className="h-32 bg-[var(--bg-elev)] rounded-md animate-pulse" />
          <div className="h-20 bg-[var(--bg-elev)] rounded-md animate-pulse" />
          <div className="h-40 bg-[var(--bg-elev)] rounded-md animate-pulse" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div
            className="streak-hero flex flex-col items-center text-center"
            style={{
              padding: '32px 20px 28px',
              gap: 10,
              borderBottom: '1px solid var(--hairline)',
              borderRadius: 0,
              border: 0,
              borderBottomWidth: 1,
              borderBottomStyle: 'solid',
              borderBottomColor: 'var(--hairline)',
              boxShadow: 'none',
              background: 'transparent',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.06em',
                color: isFrozenToday ? 'var(--status-frozen)' : 'var(--fg-3)',
                textTransform: 'uppercase',
              }}
            >
              {isFrozenToday
                ? t('streakDisplay.freeze.activeToday')
                : t('streakDisplay.detail.currentStreak')}
            </span>
            <span
              className="streak-hero__count"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: streak > 100 ? 64 : 80,
                fontWeight: 500,
                letterSpacing: '-0.04em',
                lineHeight: 0.9,
                color: 'var(--fg-1)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {streak}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: 'var(--fg-3)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {plural(t('streakDisplay.detail.daysUnit', { count: streak }), streak)}
            </span>
            {encouragement && (
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  fontStyle: 'italic',
                  color: 'var(--fg-3)',
                }}
              >
                {encouragement}
              </span>
            )}
          </div>

          <StreakTimelineCard t={t} weekDays={weekDays} />

          <FreezeProgressCard
            t={t}
            isPro={isPro}
            streak={streak}
            longestStreak={streakInfo?.longestStreak ?? 0}
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
