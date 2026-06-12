'use client'

import { useMemo, useRef, useEffect } from 'react'
import { buildStreakWeekDays } from '@orbit/shared/utils'
import { Snowflake } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile } from '@/hooks/use-profile'
import { useStreakFreeze } from '@/hooks/use-gamification'
import { useDateFormat } from '@/hooks/use-date-format'
import { StreakFreezeCelebration, type StreakFreezeCelebrationHandle } from '@/components/gamification/streak-freeze-celebration'
import { AppBar } from '@/components/ui/app-bar'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { FreezeProgressCard, StreakStatsRow, StreakTimelineCard } from './_components/streak-sections'
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
            style={{ padding: '28px 20px 24px', gap: 14 }}
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
            <span
              aria-hidden="true"
              className="flex items-center justify-center rounded-full"
              style={{
                width: 64,
                height: 64,
                background: 'color-mix(in srgb, var(--fg-1) 6%, transparent)',
              }}
            >
              {streak === 0 ? (
                <SatelliteGlyph size={56} />
              ) : (
                <span style={{ fontSize: 30, lineHeight: 1 }}>🔥</span>
              )}
            </span>
            <span className="flex items-baseline justify-center" style={{ gap: 10 }}>
              <span
                className="streak-hero__count"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 64,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  color: 'var(--fg-1)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {streak}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 20,
                  fontWeight: 500,
                  color: 'var(--fg-2)',
                }}
              >
                {plural(t('streakDisplay.detail.daysUnit', { count: streak }), streak)}
              </span>
            </span>
            {encouragement && (
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  color: 'var(--fg-3)',
                }}
              >
                {encouragement}
              </span>
            )}
          </div>

          <StreakStatsRow
            t={t}
            streak={streak}
            longestStreak={streakInfo?.longestStreak ?? 0}
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
