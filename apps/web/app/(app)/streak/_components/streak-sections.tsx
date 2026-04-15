'use client'

import { useMemo, useState } from 'react'
import { Info, Shield, Snowflake, Sparkles } from 'lucide-react'
import { formatLocaleDate } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { plural } from '@/lib/plural'

type StreakDayView = {
  dateStr: string
  dayLabel: string
  dayNum: string
  status: 'active' | 'frozen' | 'missed' | 'today' | 'future'
}

type StreakInfoView = {
  recentFreezeDates?: string[] | null
}

type TranslationFn = (key: string, params?: Record<string, string | number | Date>) => string

const DAY_STATUS_CLASSES: Record<StreakDayView['status'], string> = {
  active: 'bg-green-500/15 text-green-400 border border-green-500/25',
  frozen: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  missed: 'bg-surface-elevated text-text-muted border border-border-muted',
  today: 'bg-primary/15 text-primary border-2 border-primary/40',
  future: 'bg-surface-elevated text-text-muted border border-border-muted',
}

interface StreakTimelineCardProps {
  t: TranslationFn
  weekDays: StreakDayView[]
}

export function StreakTimelineCard({
  t,
  weekDays,
}: Readonly<StreakTimelineCardProps>) {
  return (
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
              className={`size-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 ${DAY_STATUS_CLASSES[day.status]}`}
            >
              {day.dayNum}
            </div>
          </div>
        ))}
      </div>

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
  )
}

// ---------------------------------------------------------------------------
// FreezeProgressCard -- earn-based freeze UI
// ---------------------------------------------------------------------------

const RING_SIZE = 176
const RING_STROKE = 12
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface FreezeProgressCardProps {
  t: TranslationFn
  locale: string
  streak: number
  streakFreezesAccumulated: number
  maxStreakFreezesAccumulated: number
  daysUntilNextFreeze: number
  freezesAvailable: number
  freezesUsedThisMonth: number
  maxFreezesPerMonth: number
  isFrozenToday: boolean
  hasCompletedToday: boolean
  canFreeze: boolean
  canEarnMore: boolean
  hasReachedMonthlyLimit: boolean
  freezeSuccess: boolean
  errorMessage?: string | null
  streakInfo: StreakInfoView | null
  onActivateFreeze: () => void
}

export function FreezeProgressCard(props: Readonly<FreezeProgressCardProps>) {
  const {
    t,
    locale,
    streak,
    streakFreezesAccumulated,
    maxStreakFreezesAccumulated,
    daysUntilNextFreeze,
    freezesAvailable,
    freezesUsedThisMonth,
    maxFreezesPerMonth,
    isFrozenToday,
    hasCompletedToday,
    canFreeze,
    canEarnMore,
    hasReachedMonthlyLimit,
    freezeSuccess,
    errorMessage,
    streakInfo,
    onActivateFreeze,
  } = props

  const [infoOpen, setInfoOpen] = useState(false)

  const daysEarned = Math.max(0, 7 - daysUntilNextFreeze)
  const ringProgress = canEarnMore ? Math.min(1, daysEarned / 7) : 1
  const ringOffset = RING_CIRCUMFERENCE * (1 - ringProgress)

  const subtitleText = useMemo(() => {
    if (!canEarnMore) {
      return t('streakDisplay.freeze.maxAccumulated', { max: maxStreakFreezesAccumulated })
    }
    if (streak <= 0) {
      return t('streakDisplay.freeze.noFreezesAvailable')
    }
    if (daysUntilNextFreeze === 0) {
      return t('streakDisplay.freeze.progressReady')
    }
    return plural(
      t('streakDisplay.freeze.progressSubtitle', { days: daysUntilNextFreeze }),
      daysUntilNextFreeze,
    )
  }, [canEarnMore, daysUntilNextFreeze, maxStreakFreezesAccumulated, streak, t])

  const streakLabel = plural(t('streakDisplay.freeze.dayStreak', { count: streak }), streak)

  const monthlyBadgeClass = hasReachedMonthlyLimit
    ? 'bg-red-500/15 text-red-300 border border-red-500/30'
    : 'bg-white/[0.04] text-text-muted border border-white/10'

  const activateButtonClass = canFreeze
    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_8px_24px_-8px_rgba(59,130,246,0.65)] hover:brightness-110'
    : 'bg-white/[0.04] border border-white/10 text-text-muted cursor-not-allowed opacity-60'

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-xl)] border border-white/5 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.35)] p-6"
      style={{
        background:
          'linear-gradient(155deg, rgba(59,130,246,0.12) 0%, rgba(30,58,138,0.06) 35%, rgba(var(--surface),1) 70%)',
      }}
    >
      {/* Ambient glows */}
      <div
        className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(96,165,250,0.45), transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-16 size-52 rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(147,197,253,0.3), transparent 70%)' }}
      />

      {/* Header */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-blue-500/15 ring-1 ring-blue-500/30">
            <Snowflake className="size-3.5 text-blue-300" />
          </div>
          <h2 className="text-sm font-bold text-text-primary tracking-tight">
            {t('streakDisplay.freeze.title')}
          </h2>
        </div>
        <button
          type="button"
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
          onClick={() => setInfoOpen(true)}
        >
          <Info className="size-3" />
          {t('streakDisplay.freeze.learnMore')}
        </button>
      </div>

      {/* Hero: progress ring + copy */}
      <div className="relative mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
        <div
          className="relative flex shrink-0 items-center justify-center"
          style={{ width: RING_SIZE, height: RING_SIZE }}
        >
          {/* Pulsing halo when earning */}
          {canEarnMore && streak > 0 ? (
            <div
              className="absolute inset-2 rounded-full opacity-60 blur-2xl"
              style={{
                background: 'radial-gradient(circle, rgba(59,130,246,0.35), transparent 70%)',
                animation: 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}
              aria-hidden="true"
            />
          ) : null}

          <svg
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="absolute inset-0 -rotate-90"
            width={RING_SIZE}
            height={RING_SIZE}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="freezeRingGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#93c5fd" />
                <stop offset="0.55" stopColor="#3b82f6" />
                <stop offset="1" stopColor="#1d4ed8" />
              </linearGradient>
            </defs>
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke="url(#freezeRingGradient)"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringOffset}
              fill="none"
              style={{
                transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1)',
                filter: canEarnMore ? 'drop-shadow(0 0 8px rgba(59,130,246,0.4))' : undefined,
              }}
            />
          </svg>

          <div className="relative flex flex-col items-center text-center">
            {canEarnMore ? (
              <>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-[56px] font-extrabold text-text-primary leading-none tracking-tight">
                    {daysEarned}
                  </span>
                  <span className="text-2xl font-bold text-text-muted">/7</span>
                </div>
                <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300/80">
                  {t('streakDisplay.detail.daysUnit', { count: daysEarned })
                    .split(' | ')
                    .at(daysEarned === 1 ? 0 : 1) ?? 'days'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="size-6 text-blue-300" />
                <span className="mt-1 text-3xl font-extrabold tracking-tight text-blue-300">MAX</span>
                <span className="mt-1 text-[11px] font-medium text-text-muted">
                  {maxStreakFreezesAccumulated}/{maxStreakFreezesAccumulated}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4 text-center sm:text-left">
          <div>
            <p className="text-base font-bold text-text-primary tracking-tight">
              {canEarnMore
                ? t('streakDisplay.freeze.progressTitle')
                : t('streakDisplay.freeze.title')}
            </p>
            <p className="mt-1.5 text-sm text-text-secondary leading-relaxed">{subtitleText}</p>
            {streak > 0 ? (
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-blue-300/80">
                {streakLabel}
              </p>
            ) : null}
          </div>

          {/* Accumulated shields */}
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            {Array.from({ length: maxStreakFreezesAccumulated }, (_, i) => {
              const active = i < streakFreezesAccumulated
              return (
                <div
                  key={i}
                  aria-hidden="true"
                  className={`flex size-10 items-center justify-center rounded-xl transition-all duration-300 ${
                    active
                      ? 'bg-gradient-to-br from-blue-500/25 to-blue-600/15 border border-blue-400/40 text-blue-200 shadow-[0_0_20px_rgba(59,130,246,0.35)]'
                      : 'bg-white/[0.03] border border-dashed border-white/10 text-text-muted'
                  }`}
                  style={active ? { transitionDelay: `${i * 80}ms` } : undefined}
                >
                  <Shield
                    className="size-4"
                    fill={active ? 'currentColor' : 'none'}
                    strokeWidth={1.75}
                  />
                </div>
              )
            })}
            <span className="ml-1 text-xs font-bold text-text-muted">
              {t('streakDisplay.freeze.accumulatedShort', {
                count: streakFreezesAccumulated,
                max: maxStreakFreezesAccumulated,
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Status row */}
      <div className="relative mt-5 flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${monthlyBadgeClass}`}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {t('streakDisplay.freeze.monthlyUsage', {
            used: freezesUsedThisMonth,
            max: maxFreezesPerMonth,
          })}
        </span>
        {isFrozenToday ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/30 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-200">
            <Snowflake className="size-3" />
            {t('streakDisplay.freeze.activeToday')}
          </span>
        ) : null}
      </div>

      {/* CTA */}
      {streak > 0 && !isFrozenToday ? (
        <button
          type="button"
          className={`relative mt-5 flex w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] py-3.5 text-sm font-bold transition-all duration-200 active:scale-[0.98] ${activateButtonClass}`}
          disabled={!canFreeze}
          onClick={onActivateFreeze}
        >
          <Snowflake className="size-4" />
          {t('streakDisplay.freeze.activate')}
          {canFreeze && freezesAvailable > 0 ? (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
              {freezesAvailable}
            </span>
          ) : null}
        </button>
      ) : null}

      {hasCompletedToday && !isFrozenToday && streak > 0 ? (
        <p className="relative mt-3 text-center text-xs font-medium text-emerald-400">
          {t('streakDisplay.freeze.completedToday')}
        </p>
      ) : null}
      {hasReachedMonthlyLimit && !isFrozenToday ? (
        <p className="relative mt-3 text-center text-xs font-medium text-red-400">
          {t('streakDisplay.freeze.monthlyLimit', { max: maxFreezesPerMonth })}
        </p>
      ) : null}
      {freezeSuccess ? (
        <p className="relative mt-3 text-center text-xs font-medium text-blue-300 animate-in fade-in duration-300">
          {t('streakDisplay.freeze.success')}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="relative mt-3 text-center text-xs text-red-400">{errorMessage}</p>
      ) : null}

      {streakInfo?.recentFreezeDates && streakInfo.recentFreezeDates.length > 0 ? (
        <div className="relative mt-6 space-y-2 border-t border-white/5 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            {t('streakDisplay.freeze.recentLabel')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {streakInfo.recentFreezeDates.slice(0, 5).map((date) => (
              <span
                key={date}
                className="rounded-full bg-white/[0.04] border border-white/5 px-2.5 py-1 text-[11px] font-medium text-text-muted"
              >
                {formatLocaleDate(date, locale, { month: 'short', day: 'numeric' })}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <AppOverlay
        open={infoOpen}
        onOpenChange={setInfoOpen}
        title={t('streakDisplay.freeze.howItWorksTitle')}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            {t('streakDisplay.freeze.howItWorksBody', {
              maxAccumulated: maxStreakFreezesAccumulated,
              maxMonthly: maxFreezesPerMonth,
            })}
          </p>
          <ul className="space-y-3 text-sm text-text-secondary">
            <li className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15">
                <Shield className="size-4 text-blue-300" />
              </div>
              <span>
                <strong className="text-text-primary">
                  {t('streakDisplay.freeze.progressTitle')}
                </strong>
                <br />
                7 {t('streakDisplay.detail.daysUnit', { count: 7 }).split(' | ').at(1) ?? 'days'} = 1
                freeze
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15">
                <Sparkles className="size-4 text-blue-300" />
              </div>
              <span>
                <strong className="text-text-primary">
                  {t('streakDisplay.freeze.accumulatedLabel')}
                </strong>
                <br />
                {t('streakDisplay.freeze.accumulatedShort', {
                  count: maxStreakFreezesAccumulated,
                  max: maxStreakFreezesAccumulated,
                })}
              </span>
            </li>
            <li className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15">
                <Snowflake className="size-4 text-blue-300" />
              </div>
              <span>
                <strong className="text-text-primary">
                  {t('streakDisplay.freeze.monthlyUsage', { used: 0, max: maxFreezesPerMonth })}
                </strong>
              </span>
            </li>
          </ul>
          <button
            type="button"
            className="w-full rounded-[var(--radius-lg)] bg-white/5 py-3 text-sm font-bold text-text-primary transition-colors hover:bg-white/10"
            onClick={() => setInfoOpen(false)}
          >
            {t('common.close')}
          </button>
        </div>
      </AppOverlay>
    </div>
  )
}
