'use client'

import { useMemo } from 'react'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
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

// ---------------------------------------------------------------------------
// StreakTimelineCard -- 7-day timeline with v8 hairline dots
// ---------------------------------------------------------------------------

interface StreakTimelineCardProps {
  t: TranslationFn
  weekDays: StreakDayView[]
}

export function StreakTimelineCard({
  t,
  weekDays,
}: Readonly<StreakTimelineCardProps>) {
  return (
    <div>
      <SectionLabel>{t('streakDisplay.detail.thisWeek')}</SectionLabel>
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(7, 1fr)',
          padding: '0 20px 14px',
          gap: 6,
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        {weekDays.map((day) => (
          <div
            key={day.dateStr}
            className="flex flex-col items-center"
            style={{ gap: 6, padding: '6px 0' }}
          >
            <span
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: 11,
                fontWeight: 500,
                color: day.status === 'today' || day.status === 'frozen' ? 'var(--fg-1)' : 'var(--fg-3)',
              }}
            >
              {day.dayLabel} {day.dayNum}
            </span>
            <StreakDot status={day.status} />
          </div>
        ))}
      </div>
      <div
        className="flex flex-wrap items-center justify-center"
        style={{
          gap: 16,
          padding: '10px 20px 12px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <LegendItem>
          <span aria-hidden="true" className="rounded-full" style={{ width: 7, height: 7, background: 'var(--fg-1)' }} />
          <span>{t('streakDisplay.detail.dayActive')}</span>
        </LegendItem>
        <LegendItem>
          <span aria-hidden="true" className="rounded-full" style={{ width: 7, height: 7, background: 'var(--status-frozen)' }} />
          <span>{t('streakDisplay.detail.dayFrozen')}</span>
        </LegendItem>
        <LegendItem>
          <span aria-hidden="true" className="rounded-full" style={{ width: 7, height: 7, boxShadow: 'inset 0 0 0 1.2px var(--fg-4)' }} />
          <span>{t('streakDisplay.detail.dayMissed')}</span>
        </LegendItem>
      </div>
    </div>
  )
}

function LegendItem({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 6,
        fontFamily: 'var(--font-family-mono)',
        fontSize: 11,
        color: 'var(--fg-3)',
        letterSpacing: '0.04em',
      }}
    >
      {children}
    </span>
  )
}

function StreakDot({ status }: Readonly<{ status: StreakDayView['status'] }>) {
  if (status === 'active') {
    return (
      <span
        aria-hidden="true"
        className="rounded-full"
        style={{ width: 7, height: 7, background: 'var(--fg-1)' }}
      />
    )
  }
  if (status === 'today') {
    return (
      <span
        aria-hidden="true"
        className="rounded-full"
        style={{ width: 7, height: 7, background: 'var(--primary)' }}
      />
    )
  }
  if (status === 'frozen') {
    return (
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="var(--status-frozen)" strokeWidth="1.2" aria-hidden="true">
        <circle cx="5" cy="5" r="4" />
        <line x1="5" y1="2" x2="5" y2="8" />
        <line x1="2" y1="5" x2="8" y2="5" />
      </svg>
    )
  }
  if (status === 'missed') {
    return (
      <span
        aria-hidden="true"
        className="rounded-full"
        style={{
          width: 7,
          height: 7,
          boxShadow: 'inset 0 0 0 1.2px var(--fg-4)',
        }}
      />
    )
  }
  return <span aria-hidden="true" style={{ width: 7, height: 7 }} />
}

// ---------------------------------------------------------------------------
// FreezeProgressCard -- v8 chrome: SettingsRow list, plus Activate affordance
// ---------------------------------------------------------------------------

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
  longestStreak: number
  onActivateFreeze: () => void
}

export function FreezeProgressCard(props: Readonly<FreezeProgressCardProps>) {
  const {
    t,
    streak,
    streakFreezesAccumulated,
    maxStreakFreezesAccumulated,
    daysUntilNextFreeze,
    freezesUsedThisMonth,
    maxFreezesPerMonth,
    isFrozenToday,
    hasCompletedToday,
    canFreeze,
    canEarnMore,
    hasReachedMonthlyLimit,
    freezeSuccess,
    errorMessage,
    longestStreak,
    streakInfo,
    onActivateFreeze,
  } = props

  const progressSubtitle = useMemo(() => {
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

  const recentFreezeDates = streakInfo?.recentFreezeDates ?? []

  return (
    <div>
      <SectionLabel>{t('streakDisplay.detail.stats')}</SectionLabel>
      <SettingsRow
        label={t('streakDisplay.detail.currentStreak')}
        value={String(streak)}
        mono
        accessory="none"
      />
      <SettingsRow
        label={t('streakDisplay.detail.longestStreak')}
        value={String(longestStreak)}
        mono
        accessory="none"
      />

      <SectionLabel>{t('streakDisplay.freeze.title')}</SectionLabel>
      <SettingsRow
        label={t('streakDisplay.freeze.accumulatedLabel')}
        value={t('streakDisplay.freeze.accumulatedShort', {
          count: streakFreezesAccumulated,
          max: maxStreakFreezesAccumulated,
        })}
        mono
        accessory="none"
      />
      <SettingsRow
        label={t('streakDisplay.freeze.monthlyUsageLabel')}
        value={`${freezesUsedThisMonth} / ${maxFreezesPerMonth}`}
        mono
        accessory="none"
      />
      <div
        style={{
          padding: '10px 20px 14px',
          borderBottom: '1px solid var(--hairline)',
        }}
      >
        <button
          type="button"
          onClick={onActivateFreeze}
          disabled={!canFreeze}
          aria-label={t('streakDisplay.freeze.activate')}
          className="appearance-none border-0 cursor-pointer disabled:cursor-not-allowed inline-flex items-center justify-center w-full"
          style={{
            height: 40,
            borderRadius: 8,
            background: canFreeze ? 'var(--primary)' : 'var(--bg-elev)',
            color: canFreeze ? 'var(--fg-on-primary)' : 'var(--fg-3)',
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            fontWeight: 600,
            boxShadow: canFreeze ? 'none' : 'inset 0 0 0 1px var(--hairline-strong)',
            opacity: canFreeze ? 1 : 0.7,
          }}
        >
          {t('streakDisplay.freeze.activate')}
        </button>
      </div>
      {hasReachedMonthlyLimit && (
        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--hairline)',
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--fg-3)',
          }}
        >
          {t('streakDisplay.freeze.monthlyLimit', { max: maxFreezesPerMonth })}
        </div>
      )}
      {!hasReachedMonthlyLimit && progressSubtitle && (
        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--hairline)',
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--fg-3)',
          }}
        >
          {progressSubtitle}
        </div>
      )}
      {isFrozenToday && (
        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--hairline)',
            fontFamily: 'var(--font-family-mono)',
            fontSize: 11,
            color: 'var(--status-frozen)',
            letterSpacing: '0.06em',
          }}
        >
          {t('streakDisplay.freeze.activeToday')}
        </div>
      )}
      {hasCompletedToday && !isFrozenToday && streak > 0 && (
        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--hairline)',
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--fg-3)',
          }}
        >
          {t('streakDisplay.freeze.completedToday')}
        </div>
      )}
      {freezeSuccess && (
        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--hairline)',
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            color: 'var(--status-frozen)',
          }}
        >
          {t('streakDisplay.freeze.success')}
        </div>
      )}
      {errorMessage && (
        <div
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--hairline)',
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--status-overdue)',
          }}
        >
          {errorMessage}
        </div>
      )}
      {recentFreezeDates.length > 0 && (
        <>
          <SectionLabel>{t('streakDisplay.freeze.recentLabel')}</SectionLabel>
          <div
            style={{
              padding: '0 20px 14px',
              borderBottom: '1px solid var(--hairline)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            {recentFreezeDates.slice(0, 5).map((date) => (
              <span
                key={date}
                style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: 11,
                  color: 'var(--fg-2)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {date}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
