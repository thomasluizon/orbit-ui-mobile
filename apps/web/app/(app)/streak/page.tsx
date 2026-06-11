'use client'

import { useMemo, useRef, useEffect } from 'react'
import { subDays, isToday, format, parseISO } from 'date-fns'
import { Snowflake } from 'lucide-react'
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
          <div className="h-32 bg-[var(--bg-card)] rounded-[18px] animate-pulse" />
          <div className="h-20 bg-[var(--bg-card)] rounded-[18px] animate-pulse" />
          <div className="h-40 bg-[var(--bg-card)] rounded-[18px] animate-pulse" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isFrozenToday && (
            <div className="px-5" style={{ paddingTop: 16 }}>
              <div
                className="flex items-center rounded-[18px]"
                style={{
                  padding: '16px 18px',
                  gap: 14,
                  background: 'color-mix(in srgb, var(--status-frozen) 10%, transparent)',
                  boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--status-frozen) 28%, transparent)',
                }}
              >
                <Snowflake
                  size={24}
                  strokeWidth={1.9}
                  color="var(--status-frozen)"
                  aria-hidden="true"
                />
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 16,
                    fontWeight: 500,
                    color: 'var(--fg-1)',
                  }}
                >
                  {t('streakDisplay.freeze.activeToday')}
                </span>
              </div>
            </div>
          )}

          <div
            className="streak-hero flex flex-col items-center text-center"
            style={{ padding: '28px 20px 22px', gap: 10 }}
          >
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '0.08em',
                color: isFrozenToday ? 'var(--status-frozen)' : 'var(--fg-3)',
                textTransform: 'uppercase',
              }}
            >
              {isFrozenToday
                ? t('streakDisplay.freeze.activeToday')
                : t('streakDisplay.detail.currentStreak')}
            </span>
            <span className="flex items-center justify-center" style={{ gap: 12 }}>
              <span style={{ fontSize: 36, lineHeight: 1 }} aria-hidden="true">
                {streak === 0 ? '🌑' : '🔥'}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 44,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  color: 'var(--fg-1)',
                }}
              >
                <span className="streak-hero__count" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {streak}
                </span>{' '}
                {plural(t('streakDisplay.detail.daysUnit', { count: streak }), streak)}
              </span>
            </span>
            {encouragement && (
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 15,
                  color: 'var(--fg-2)',
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
