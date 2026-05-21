'use client'

import { useState, useMemo, useRef } from 'react'
import { subDays, isToday, format, parseISO } from 'date-fns'
import { useTranslations } from 'next-intl'
import { getErrorMessage } from '@orbit/shared/utils'
import { plural } from '@/lib/plural'
import { useProfile } from '@/hooks/use-profile'
import { useActivateStreakFreeze, useStreakFreeze } from '@/hooks/use-gamification'
import { useDeviceLocale } from '@/hooks/use-device-locale'
import { useDateFormat } from '@/hooks/use-date-format'
import { StreakFreezeCelebration, type StreakFreezeCelebrationHandle } from '@/components/gamification/streak-freeze-celebration'
import { AppBar } from '@/components/ui/app-bar'
import { AppOverlay } from '@/components/ui/app-overlay'
import { FreezeProgressCard, StreakTimelineCard } from './_components/streak-sections'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import './streak.css'

export default function StreakPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const locale = useDeviceLocale()
  const { displayDate } = useDateFormat()
  const { profile } = useProfile()
  const streak = profile?.currentStreak ?? 0
  const {
    streakQuery,
    streakInfo,
    freezesAvailable,
    isFrozenToday,
    hasCompletedToday,
    canFreeze,
    streakFreezesAccumulated,
    maxStreakFreezesAccumulated,
    daysUntilNextFreeze,
    freezesUsedThisMonth,
    maxFreezesPerMonth,
    canEarnMore,
    hasReachedMonthlyLimit,
  } = useStreakFreeze(profile)
  const activateFreezeMutation = useActivateStreakFreeze()

  const [showConfirm, setShowConfirm] = useState(false)
  const [freezeSuccess, setFreezeSuccess] = useState(false)
  const freezeCelebrationRef = useRef<StreakFreezeCelebrationHandle>(null)

  const encouragement = useMemo(() => {
    if (streak >= 365) return t('streakDisplay.profile.encouragement365')
    if (streak >= 100) return t('streakDisplay.profile.encouragement100')
    if (streak >= 30) return t('streakDisplay.profile.encouragement30')
    if (streak >= 14) return t('streakDisplay.profile.encouragement14')
    if (streak >= 7) return t('streakDisplay.profile.encouragement7')
    if (streak >= 1) return t('streakDisplay.profile.encouragement1')
    return ''
  }, [streak, t])

  const tier = useMemo(() => {
    if (streak >= 100) return 'legendary'
    if (streak >= 30) return 'intense'
    if (streak >= 7) return 'strong'
    return 'normal'
  }, [streak])

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

  async function handleFreeze() {
    setShowConfirm(false)
    try {
      await activateFreezeMutation.mutateAsync()
      setFreezeSuccess(true)
      setTimeout(() => setFreezeSuccess(false), 3000)
      freezeCelebrationRef.current?.show()
    } catch {
      // Error surfaced via mutation.error
    }
  }

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
          {/* Hero block: 80px mono number */}
          <div
            className={`streak-hero streak-hero--${tier} flex flex-col items-center text-center`}
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
                fontFamily: 'var(--font-family-mono)',
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
                fontFamily: 'var(--font-family-mono)',
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
                fontFamily: 'var(--font-family-sans)',
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
                  fontFamily: 'var(--font-family-sans)',
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
            locale={locale}
            streak={streak}
            longestStreak={streakInfo?.longestStreak ?? 0}
            streakFreezesAccumulated={streakFreezesAccumulated}
            maxStreakFreezesAccumulated={maxStreakFreezesAccumulated}
            daysUntilNextFreeze={daysUntilNextFreeze}
            freezesAvailable={freezesAvailable}
            freezesUsedThisMonth={freezesUsedThisMonth}
            maxFreezesPerMonth={maxFreezesPerMonth}
            isFrozenToday={isFrozenToday}
            hasCompletedToday={hasCompletedToday}
            canFreeze={canFreeze}
            canEarnMore={canEarnMore}
            hasReachedMonthlyLimit={hasReachedMonthlyLimit}
            freezeSuccess={freezeSuccess}
            errorMessage={
              activateFreezeMutation.error
                ? getErrorMessage(activateFreezeMutation.error, t('toast.errors.activateFreeze'))
                : undefined
            }
            streakInfo={streakInfo}
            onActivateFreeze={() => setShowConfirm(true)}
          />
        </div>
      )}

      <AppOverlay
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={t('streakDisplay.freeze.confirmTitle')}
      >
        <div className="space-y-4">
          <p
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--fg-2)',
            }}
          >
            {plural(
              t('streakDisplay.freeze.confirmBody', {
                count: freezesAvailable,
                remaining: freezesAvailable,
                streak,
              }),
              freezesAvailable,
            )}
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={activateFreezeMutation.isPending}
              onClick={handleFreeze}
              className="appearance-none border-0 cursor-pointer disabled:cursor-not-allowed inline-flex items-center justify-center w-full"
              style={{
                height: 44,
                borderRadius: 8,
                background: 'var(--primary)',
                color: 'var(--fg-on-primary)',
                fontFamily: 'var(--font-family-sans)',
                fontSize: 14,
                fontWeight: 600,
                opacity: activateFreezeMutation.isPending ? 0.5 : 1,
              }}
            >
              {activateFreezeMutation.isPending ? '...' : t('streakDisplay.freeze.activate')}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center justify-center w-full"
              style={{
                height: 40,
                fontFamily: 'var(--font-family-sans)',
                fontSize: 13,
                color: 'var(--fg-3)',
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </AppOverlay>

      <StreakFreezeCelebration ref={freezeCelebrationRef} />
    </div>
  )
}
