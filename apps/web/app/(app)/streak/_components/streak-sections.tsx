'use client'

import React, { type ReactNode } from 'react'
import { CalendarDays, Snowflake } from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import { StatTile } from '@/components/ui/stat-tile'
import { ProgressBar } from '@/components/ui/progress-bar'
import { getStreakTierLabelKey } from '@orbit/shared/utils'

type StreakDayView = {
  dateStr: string
  dayLabel: string
  dayNum: string
  status: 'active' | 'frozen' | 'missed' | 'today'
}

type StreakInfoView = {
  recentFreezeDates?: string[] | null
}

type TranslationFn = (key: string, params?: Record<string, string | number | Date>) => string

interface StreakStatsRowProps {
  t: TranslationFn
  streak: number
  longestStreak: number
}

export function StreakStatsRow({
  t,
  streak,
  longestStreak,
}: Readonly<StreakStatsRowProps>) {
  return (
    <div>
      <SectionLabel>{t('streakDisplay.detail.stats')}</SectionLabel>
      <div className="flex px-5" style={{ gap: 12 }}>
        <StatTile
          emoji="🔥"
          value={streak}
          label={t('streakDisplay.detail.currentStreak')}
        />
        <StatTile
          emoji="🏆"
          value={longestStreak}
          label={t('streakDisplay.detail.longestStreak')}
        />
        <StatTile
          emoji="🎖️"
          value={t(getStreakTierLabelKey(streak))}
          label={t('streakDisplay.detail.tierTileLabel')}
          phraseValue
        />
      </div>
    </div>
  )
}

function isInRun(status: StreakDayView['status']): boolean {
  return status === 'active' || status === 'frozen'
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
    <div>
      <SectionLabel>{t('streakDisplay.detail.thisWeek')}</SectionLabel>
      <div className="px-5">
        <div
          className="rounded-[18px] bg-[var(--bg-card)]"
          style={{
            padding: '16px 14px 14px',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
          }}
        >
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 8 }}
          >
            {weekDays.map((day) => (
              <span
                key={day.dateStr}
                className="text-center uppercase"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  color: 'var(--fg-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {day.dayLabel}
              </span>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {weekDays.map((day, index) => (
              <StreakDayCell
                key={day.dateStr}
                day={day}
                runStart={isInRun(day.status) && (index === 0 || !isInRun(weekDays[index - 1]!.status))}
                runEnd={isInRun(day.status) && (index === weekDays.length - 1 || !isInRun(weekDays[index + 1]!.status))}
              />
            ))}
          </div>
          <div
            className="flex flex-wrap items-center justify-center"
            style={{ gap: 16, paddingTop: 12 }}
          >
            <LegendItem swatch={<span aria-hidden="true" className="rounded-full" style={{ width: 8, height: 8, background: 'var(--status-overdue)' }} />}>
              {t('streakDisplay.detail.dayActive')}
            </LegendItem>
            <LegendItem swatch={<span aria-hidden="true" className="rounded-full" style={{ width: 8, height: 8, background: 'var(--status-frozen)' }} />}>
              {t('streakDisplay.detail.dayFrozen')}
            </LegendItem>
            <LegendItem swatch={<span aria-hidden="true" className="rounded-full" style={{ width: 8, height: 8, boxShadow: 'inset 0 0 0 1px var(--status-empty)' }} />}>
              {t('streakDisplay.detail.dayMissed')}
            </LegendItem>
          </div>
        </div>
      </div>
    </div>
  )
}

function StreakDayCell({
  day,
  runStart,
  runEnd,
}: Readonly<{ day: StreakDayView; runStart: boolean; runEnd: boolean }>) {
  const inRun = isInRun(day.status)

  let numeralColor = 'var(--fg-3)'
  if (day.status === 'active' || day.status === 'frozen' || day.status === 'today') {
    numeralColor = 'var(--fg-1)'
  }

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ height: 42 }}
    >
      {inRun && (
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            top: 7,
            bottom: 7,
            left: runStart ? 5 : 0,
            right: runEnd ? 5 : 0,
            background: 'color-mix(in srgb, var(--status-overdue) 16%, transparent)',
            borderTopLeftRadius: runStart ? 999 : 0,
            borderBottomLeftRadius: runStart ? 999 : 0,
            borderTopRightRadius: runEnd ? 999 : 0,
            borderBottomRightRadius: runEnd ? 999 : 0,
          }}
        />
      )}
      <span
        className="relative inline-flex items-center justify-center rounded-full"
        style={{
          zIndex: 1,
          width: 28,
          height: 28,
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          fontWeight: day.status === 'today' ? 700 : 500,
          fontVariantNumeric: 'tabular-nums',
          color: numeralColor,
          boxShadow:
            day.status === 'today' ? 'inset 0 0 0 1.5px var(--primary)' : 'none',
        }}
      >
        {day.dayNum}
      </span>
      {day.status === 'frozen' && (
        <span
          aria-hidden="true"
          className="absolute inline-flex items-center justify-center"
          style={{
            top: 1,
            zIndex: 2,
            width: 17,
            height: 17,
            borderRadius: '50% 50% 50% 0',
            transform: 'rotate(45deg)',
            background: 'var(--status-frozen)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}
        >
          <Snowflake
            size={10}
            strokeWidth={2.2}
            color="var(--bg)"
            style={{ transform: 'rotate(-45deg)' }}
          />
        </span>
      )}
    </div>
  )
}

function LegendItem({
  swatch,
  children,
}: Readonly<{ swatch: ReactNode; children: ReactNode }>) {
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--fg-3)',
        letterSpacing: '0.04em',
      }}
    >
      {swatch}
      <span>{children}</span>
    </span>
  )
}

function CardGroup({ children }: Readonly<{ children: ReactNode }>) {
  const rows = React.Children.toArray(children).filter(Boolean)
  return (
    <div
      className="overflow-hidden rounded-[18px] bg-[var(--bg-card)]"
      style={{ boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
    >
      {rows.map((row, index) => (
        <div key={index}>
          {index > 0 ? (
            <div aria-hidden="true" style={{ height: 1, background: 'var(--hairline)' }} />
          ) : null}
          {row}
        </div>
      ))}
    </div>
  )
}

function CardRow({
  icon,
  label,
  trailing,
}: Readonly<{ icon?: ReactNode; label: ReactNode; trailing?: ReactNode }>) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: '15px 18px', gap: 12, minHeight: 52 }}
    >
      <span className="flex min-w-0 items-center" style={{ gap: 12 }}>
        {icon ? (
          <span aria-hidden="true" className="flex shrink-0 items-center justify-center" style={{ width: 22 }}>
            {icon}
          </span>
        ) : null}
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            color: 'var(--fg-1)',
          }}
        >
          {label}
        </span>
      </span>
      <span className="flex shrink-0 items-center" style={{ gap: 10 }}>
        {trailing}
      </span>
    </div>
  )
}

function StatValue({ value }: Readonly<{ value: number | string }>) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--fg-2)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </span>
  )
}

const STREAK_DAYS_PER_FREEZE = 7

interface FreezeProgressCardProps {
  t: TranslationFn
  isPro: boolean
  streak: number
  streakFreezesAccumulated: number
  maxStreakFreezesAccumulated: number
  freezesUsedThisMonth: number
  maxFreezesPerMonth: number
  isFrozenToday: boolean
  streakInfo: StreakInfoView | null
  displayDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string
}

export function FreezeProgressCard(props: Readonly<FreezeProgressCardProps>) {
  const {
    t,
    isPro,
    streak,
    streakFreezesAccumulated,
    maxStreakFreezesAccumulated,
    freezesUsedThisMonth,
    maxFreezesPerMonth,
    isFrozenToday,
    streakInfo,
    displayDate,
  } = props

  const isBankedFull = streakFreezesAccumulated >= maxStreakFreezesAccumulated
  const nextFreezeDays = STREAK_DAYS_PER_FREEZE - (streak % STREAK_DAYS_PER_FREEZE)
  const nextFreezeProgress = isBankedFull
    ? 1
    : (STREAK_DAYS_PER_FREEZE - nextFreezeDays) / STREAK_DAYS_PER_FREEZE
  const protectedDates = (streakInfo?.recentFreezeDates ?? []).slice(0, 5)

  return (
    <div>
      <SectionLabel>{t('streakDisplay.freeze.title')}</SectionLabel>

      {isPro ? (
        <>
          <div className="px-5">
            <p
              style={{
                marginBottom: 14,
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                lineHeight: 1.55,
                color: 'var(--fg-3)',
              }}
            >
              {t('streakDisplay.freeze.auto.explainer')}
            </p>
            <div
              className="rounded-[18px] bg-[var(--bg-card)]"
              style={{
                padding: '16px 18px',
                boxShadow: 'inset 0 0 0 1px var(--hairline)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div className="flex items-center justify-between" style={{ gap: 12 }}>
                <span className="flex min-w-0 items-center" style={{ gap: 12 }}>
                  <Snowflake
                    size={20}
                    strokeWidth={1.8}
                    color="var(--status-frozen)"
                    aria-hidden="true"
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 16,
                      color: 'var(--fg-1)',
                    }}
                  >
                    {t('streakDisplay.freeze.banked.label')}
                  </span>
                </span>
                <span className="flex shrink-0 items-center" style={{ gap: 10 }}>
                  <ChargeGauge
                    banked={streakFreezesAccumulated}
                    max={maxStreakFreezesAccumulated}
                  />
                  <StatValue
                    value={`${streakFreezesAccumulated}/${maxStreakFreezesAccumulated}`}
                  />
                </span>
              </div>

              <div className="flex items-center justify-between" style={{ gap: 12 }}>
                <span className="flex min-w-0 items-center" style={{ gap: 12 }}>
                  <CalendarDays
                    size={20}
                    strokeWidth={1.8}
                    color="var(--fg-3)"
                    aria-hidden="true"
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 16,
                      color: 'var(--fg-1)',
                    }}
                  >
                    {t('streakDisplay.freeze.usedThisMonth.label')}
                  </span>
                </span>
                <StatValue value={`${freezesUsedThisMonth}/${maxFreezesPerMonth}`} />
              </div>

              <div className="flex flex-col" style={{ gap: 10 }}>
                <div className="flex items-center justify-between" style={{ gap: 12 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 16,
                      color: 'var(--fg-1)',
                    }}
                  >
                    {t('streakDisplay.freeze.nextFreeze.label')}
                  </span>
                  <StatValue
                    value={
                      isBankedFull
                        ? t('streakDisplay.freeze.nextFreeze.full')
                        : t('streakDisplay.freeze.nextFreeze.inDays', {
                            days: nextFreezeDays,
                          })
                    }
                  />
                </div>
                <ProgressBar
                  progress={nextFreezeProgress}
                  label={t('streakDisplay.freeze.nextFreeze.label')}
                  color="var(--status-frozen)"
                />
              </div>
            </div>
          </div>

          <SectionLabel>{t('streakDisplay.freeze.protected.label')}</SectionLabel>
          <div className="px-5" style={{ paddingBottom: 14 }}>
            {isFrozenToday || protectedDates.length > 0 ? (
              <CardGroup>
                {isFrozenToday && (
                  <ProtectedRow
                    label={t('streakDisplay.freeze.protected.today')}
                    value={t('streakDisplay.freeze.protected.todayValue')}
                  />
                )}
                {protectedDates.map((date) => (
                  <ProtectedRow
                    key={date}
                    label={displayDate(date, { month: 'short', day: 'numeric' })}
                  />
                ))}
              </CardGroup>
            ) : (
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: 'var(--fg-3)',
                }}
              >
                {t('streakDisplay.freeze.protected.empty')}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="px-5" style={{ paddingBottom: 14 }}>
          <div
            className="flex items-center rounded-[18px]"
            style={{
              padding: '16px 18px',
              gap: 14,
              background: 'rgba(var(--primary-rgb), 0.08)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.28)',
            }}
          >
            <Snowflake
              size={24}
              strokeWidth={1.9}
              color="var(--status-frozen)"
              aria-hidden="true"
            />
            <span
              className="flex-1 min-w-0"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 16,
                fontWeight: 500,
                lineHeight: 1.4,
                color: 'var(--fg-1)',
              }}
            >
              {t('streakDisplay.freeze.pro.gate')}
            </span>
            <a
              href="/upgrade"
              className="shrink-0 rounded-full transition-[background-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:-translate-y-px hover:bg-[var(--primary-pressed)] active:translate-y-0 active:scale-[0.96]"
              style={{
                padding: '9px 16px',
                background: 'var(--primary)',
                color: 'var(--fg-on-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                fontWeight: 500,
                boxShadow: 'var(--primary-glow)',
              }}
            >
              {t('common.upgrade')}
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function ChargeGauge({
  banked,
  max,
}: Readonly<{ banked: number; max: number }>) {
  return (
    <span className="inline-flex items-center" style={{ gap: 5 }}>
      {Array.from({ length: max }, (_, index) => {
        const filled = index < banked
        return (
          <span
            key={index}
            aria-hidden="true"
            className="streak-pip block rounded-full"
            style={{
              width: 10,
              height: 10,
              animationDelay: `${index * 40}ms`,
              background: filled ? 'var(--status-frozen)' : 'transparent',
              boxShadow: filled ? 'none' : 'inset 0 0 0 1.5px var(--hairline)',
            }}
          />
        )
      })}
    </span>
  )
}

function ProtectedRow({
  label,
  value,
}: Readonly<{ label: string; value?: string }>) {
  return (
    <CardRow
      icon={
        <span
          className="block rounded-full"
          style={{ width: 8, height: 8, background: 'var(--status-frozen)' }}
        />
      }
      label={label}
      trailing={value ? <StatValue value={value} /> : undefined}
    />
  )
}
