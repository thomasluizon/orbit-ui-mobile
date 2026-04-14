'use client'

import type { Locale } from 'date-fns'
import { formatLocaleDate } from '@orbit/shared/utils'

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

interface StreakFreezeSectionProps {
  t: TranslationFn
  locale: string
  dateFnsLocale: Locale
  streak: number
  freezesAvailable: number
  isFrozenToday: boolean
  hasCompletedToday: boolean
  canFreeze: boolean
  freezeSuccess: boolean
  errorMessage?: string | null
  streakInfo: StreakInfoView | null
  onActivateFreeze: () => void
}

export function StreakFreezeSection({
  t,
  locale,
  dateFnsLocale,
  streak,
  freezesAvailable,
  isFrozenToday,
  hasCompletedToday,
  canFreeze,
  freezeSuccess,
  errorMessage,
  streakInfo,
  onActivateFreeze,
}: Readonly<StreakFreezeSectionProps>) {
  const freezeButtonClass = canFreeze
    ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/15 hover:border-blue-500/30'
    : 'bg-surface-elevated text-text-muted cursor-not-allowed opacity-50'
  const freezeButton = streak > 0 ? (
    <button
      className={`w-full py-3 rounded-[var(--radius-lg)] text-sm font-bold transition-all duration-200 active:scale-[0.98] ${freezeButtonClass}`}
      disabled={!canFreeze}
      onClick={onActivateFreeze}
    >
      {t('streakDisplay.freeze.activate')}
    </button>
  ) : null

  return (
    <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 12 14" fill="none" className="size-4">
            <path d="M6 0v14M2 2l4 4 4-4M2 12l4-4 4 4M0 7h12" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-bold text-text-primary">{t('streakDisplay.freeze.title')}</span>
        </div>
        <span className="text-xs text-text-muted">
          {t('streakDisplay.freeze.available', { count: freezesAvailable })}
        </span>
      </div>

      {isFrozenToday ? (
        <div className="flex items-center gap-2 bg-blue-500/8 border border-blue-500/15 rounded-[var(--radius-lg)] px-3.5 py-2.5">
          <svg viewBox="0 0 12 14" fill="none" className="size-4">
            <path d="M6 0v14M2 2l4 4 4-4M2 12l4-4 4 4M0 7h12" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-bold text-blue-400">{t('streakDisplay.freeze.activeToday')}</span>
        </div>
      ) : freezeButton}

      {hasCompletedToday && !isFrozenToday && streak > 0 ? (
        <p className="text-xs text-green-400 text-center font-medium">
          {t('streakDisplay.freeze.completedToday')}
        </p>
      ) : null}

      {freezeSuccess ? (
        <p className="text-xs text-blue-400 text-center font-medium animate-in fade-in duration-300">
          {t('streakDisplay.freeze.success')}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="text-xs text-red-400 text-center">
          {errorMessage}
        </p>
      ) : null}

      {streakInfo?.recentFreezeDates && streakInfo.recentFreezeDates.length > 0 ? (
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
                {formatLocaleDate(date, locale, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
