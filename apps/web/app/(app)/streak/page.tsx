'use client'

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { subDays, isToday, format, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useTranslations, useLocale } from 'next-intl'
import { plural } from '@/lib/plural'
import { useProfile } from '@/hooks/use-profile'
import { useActivateStreakFreeze, useStreakFreeze } from '@/hooks/use-gamification'
import { StreakFreezeCelebration, type StreakFreezeCelebrationHandle } from '@/components/gamification/streak-freeze-celebration'
import { AppOverlay } from '@/components/ui/app-overlay'
import './streak.css'

export default function StreakPage() {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { profile } = useProfile()
  const streak = profile?.currentStreak ?? 0
  const { streakQuery, streakInfo, freezesAvailable, isFrozenToday, hasCompletedToday, canFreeze } = useStreakFreeze(profile)
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

  // Build 7-day timeline (today + 6 previous days)
  const weekDays = useMemo(() => {
    const today = new Date()
    const freezeDates = new Set(streakInfo?.recentFreezeDates ?? [])
    const lastActive = streakInfo?.lastActiveDate
    const lastActiveDate = lastActive ? parseISO(lastActive) : null
    const currentStreak = streak

    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(today, 6 - i)
      const dateStr = format(date, 'yyyy-MM-dd')
      const dayLabel = format(date, 'EEE', { locale: dateFnsLocale }).slice(0, 3)
      const dayNum = format(date, 'd')
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

      return { date, dateStr, dayLabel, dayNum, status, isTodayDate }
    })
  }, [streakInfo, streak, isFrozenToday, dateFnsLocale])

  async function handleFreeze() {
    setShowConfirm(false)
    try {
      await activateFreezeMutation.mutateAsync()
      setFreezeSuccess(true)
      setTimeout(() => setFreezeSuccess(false), 3000)
      freezeCelebrationRef.current?.show()
    } catch {
      // Error is handled by the mutation
    }
  }

  const statusClass: Record<string, string> = {
    active: 'bg-green-500/15 text-green-400 border border-green-500/25',
    frozen: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',
    missed: 'bg-surface-elevated text-text-muted border border-border-muted',
    today: 'bg-primary/15 text-primary border-2 border-primary/40',
    future: 'bg-surface-elevated text-text-muted border border-border-muted',
  }

  return (
    <div className="pb-8">
      {/* Header */}
      <header className="pt-8 pb-6 flex items-center gap-3">
        <Link href="/profile" className="p-2 -ml-2 rounded-full hover:bg-surface transition-colors">
          <ArrowLeft className="size-5 text-text-primary" />
        </Link>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          {t('streakDisplay.detail.title')}
        </h1>
      </header>

      {/* Loading */}
      {streakQuery.isLoading && !streakInfo ? (
        <div className="space-y-6">
          <div className="h-32 bg-surface rounded-[var(--radius-xl)] animate-pulse" />
          <div className="h-20 bg-surface rounded-[var(--radius-xl)] animate-pulse" />
          <div className="h-24 bg-surface rounded-[var(--radius-xl)] animate-pulse" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Streak hero */}
          <div className={`streak-hero streak-hero--${tier}`}>
            {streak > 0 && <div className="streak-hero__glow" />}
            <div className="relative flex flex-col items-center text-center py-4">
              {/* Flame */}
              {streak > 0 ? (
                <div className="streak-hero__flame mb-3">
                  <svg viewBox="0 0 40 50" fill="none" className="size-16">
                    <path
                      d="M20 0C20 0 5 16.25 5 30a15 15 0 0 0 30 0C35 16.25 20 0 20 0Zm0 42.5a7.5 7.5 0 0 1-7.5-7.5c0-5 7.5-13.75 7.5-13.75S27.5 30 27.5 35A7.5 7.5 0 0 1 20 42.5Z"
                      fill="url(#streakDetailFlame)"
                    />
                    <defs>
                      <linearGradient id="streakDetailFlame" x1="20" y1="0" x2="20" y2="50" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#fbbf24" />
                        <stop offset="0.5" stopColor="#f97316" />
                        <stop offset="1" stopColor="#ef4444" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              ) : (
                <div className="size-16 flex items-center justify-center rounded-full bg-surface-elevated mb-3">
                  <svg viewBox="0 0 40 50" fill="none" className="size-10 opacity-30">
                    <path
                      d="M20 0C20 0 5 16.25 5 30a15 15 0 0 0 30 0C35 16.25 20 0 20 0Zm0 42.5a7.5 7.5 0 0 1-7.5-7.5c0-5 7.5-13.75 7.5-13.75S27.5 30 27.5 35A7.5 7.5 0 0 1 20 42.5Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
              )}

              {/* Count */}
              <p className="text-4xl font-extrabold tracking-tight streak-hero__count">
                {streak}
              </p>
              <p className="text-sm text-text-secondary mt-1">
                {plural(t('streakDisplay.detail.daysUnit', { count: streak }), streak)}
              </p>
              {encouragement && (
                <p className="text-sm text-text-secondary mt-2 font-medium">
                  {encouragement}
                </p>
              )}
            </div>
          </div>

          {/* Weekly timeline */}
          <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
              {t('streakDisplay.detail.thisWeek')}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day) => (
                <div key={day.dateStr} className="flex flex-col items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {day.dayLabel}
                  </span>
                  <div
                    className={`size-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 ${statusClass[day.status]}`}
                  >
                    {day.dayNum}
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-center gap-4 mt-4 pt-3 border-t border-border-muted">
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-green-500" />
                <span className="text-[10px] text-text-muted">{t('streakDisplay.detail.dayActive')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-blue-500" />
                <span className="text-[10px] text-text-muted">{t('streakDisplay.detail.dayFrozen')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-text-muted" />
                <span className="text-[10px] text-text-muted">{t('streakDisplay.detail.dayMissed')}</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-4 text-center">
              <p className="text-2xl font-extrabold text-amber-400">{streak}</p>
              <p className="text-xs text-text-muted font-bold uppercase tracking-wider mt-1">
                {t('streakDisplay.detail.currentStreak')}
              </p>
            </div>
            <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-4 text-center">
              <p className="text-2xl font-extrabold text-amber-500/60">{streakInfo?.longestStreak ?? 0}</p>
              <p className="text-xs text-text-muted font-bold uppercase tracking-wider mt-1">
                {t('streakDisplay.detail.longestStreak')}
              </p>
            </div>
          </div>

          {/* Freeze section */}
          <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 12 14" fill="none" className="size-4">
                  <path d="M6 0v14M2 2l4 4 4-4M2 12l4-4 4 4M0 7h12" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-sm font-bold text-text-primary">{t('streakDisplay.freeze.title')}</span>
              </div>
              <span className="text-xs text-text-muted">
                {plural(t('streakDisplay.freeze.available', { count: freezesAvailable }), freezesAvailable)}
              </span>
            </div>

            {/* Frozen today indicator */}
            {isFrozenToday ? (
              <div className="flex items-center gap-2 bg-blue-500/8 border border-blue-500/15 rounded-[var(--radius-lg)] px-3.5 py-2.5">
                <svg viewBox="0 0 12 14" fill="none" className="size-4">
                  <path d="M6 0v14M2 2l4 4 4-4M2 12l4-4 4 4M0 7h12" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs font-bold text-blue-400">{t('streakDisplay.freeze.activeToday')}</span>
              </div>
            ) : streak > 0 ? (
              <button
                className={`w-full py-3 rounded-[var(--radius-lg)] text-sm font-bold transition-all duration-200 active:scale-[0.98] ${
                  canFreeze
                    ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/15 hover:border-blue-500/30'
                    : 'bg-surface-elevated text-text-muted cursor-not-allowed opacity-50'
                }`}
                disabled={!canFreeze}
                onClick={() => setShowConfirm(true)}
              >
                {t('streakDisplay.freeze.activate')}
              </button>
            ) : null}

            {/* Already completed today hint */}
            {hasCompletedToday && !isFrozenToday && streak > 0 && (
              <p className="text-xs text-green-400 text-center font-medium">
                {t('streakDisplay.freeze.completedToday')}
              </p>
            )}

            {/* Success message */}
            {freezeSuccess && (
              <p className="text-xs text-blue-400 text-center font-medium animate-in fade-in duration-300">
                {t('streakDisplay.freeze.success')}
              </p>
            )}

            {/* Error message */}
            {activateFreezeMutation.error && (
              <p className="text-xs text-red-400 text-center">
                {activateFreezeMutation.error.message}
              </p>
            )}

            {/* Recent freeze dates */}
            {streakInfo?.recentFreezeDates && streakInfo.recentFreezeDates.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  {t('streakDisplay.freeze.recentLabel')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {streakInfo.recentFreezeDates.slice(0, 5).map((date) => (
                    <span
                      key={date}
                      className="text-[10px] text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full"
                    >
                      {format(parseISO(date), locale === 'pt-BR' ? 'dd MMM' : 'MMM d', { locale: dateFnsLocale })}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Freeze confirmation overlay */}
      <AppOverlay
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={t('streakDisplay.freeze.confirmTitle')}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            {plural(t('streakDisplay.freeze.confirmBody', { count: freezesAvailable, remaining: freezesAvailable, streak }), freezesAvailable)}
          </p>
          <div className="flex flex-col gap-2">
            <button
              className="w-full py-3 rounded-[var(--radius-xl)] bg-blue-500/15 border border-blue-500/25 text-blue-400 font-bold text-sm hover:bg-blue-500/25 transition-all active:scale-[0.98] disabled:opacity-50"
              disabled={activateFreezeMutation.isPending}
              onClick={handleFreeze}
            >
              {activateFreezeMutation.isPending ? '...' : t('streakDisplay.freeze.activate')}
            </button>
            <button
              className="w-full py-2.5 text-text-secondary text-sm font-medium hover:text-text-primary transition-colors"
              onClick={() => setShowConfirm(false)}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </AppOverlay>

      {/* Streak freeze celebration overlay */}
      <StreakFreezeCelebration ref={freezeCelebrationRef} />
    </div>
  )
}
