'use client'

import React, { type ReactNode } from 'react'
import {
  CalendarDays,
  Clock,
  Flame,
  Medal,
  Snowflake,
  Trophy,
} from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import { getStreakTierLabelKey } from '@orbit/shared/utils'

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

interface StreakTimelineCardProps {
  t: TranslationFn
  weekDays: StreakDayView[]
}

function isInRun(status: StreakDayView['status']): boolean {
  return status === 'active' || status === 'frozen'
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
                  color: 'var(--fg-4)',
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

  let numeralColor = 'var(--fg-4)'
  if (day.status === 'active') numeralColor = 'var(--status-overdue)'
  if (day.status === 'frozen' || day.status === 'today') numeralColor = 'var(--fg-1)'

  let discStyle: React.CSSProperties = {}
  if (day.status === 'today') {
    discStyle = {
      background: 'var(--bg-elev-2)',
      boxShadow: 'inset 0 0 0 1.5px var(--fg-4)',
    }
  } else if (day.status === 'missed') {
    discStyle = { boxShadow: 'inset 0 0 0 1px var(--status-empty)' }
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
          ...discStyle,
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
        fontFamily: 'var(--font-sans)',
        fontSize: 15,
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
  longestStreak: number
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
    longestStreak,
    streakInfo,
    displayDate,
  } = props

  const isBankedFull = streakFreezesAccumulated >= maxStreakFreezesAccumulated
  const nextFreezeDays = STREAK_DAYS_PER_FREEZE - (streak % STREAK_DAYS_PER_FREEZE)
  const protectedDates = (streakInfo?.recentFreezeDates ?? []).slice(0, 5)

  return (
    <div>
      <SectionLabel>{t('streakDisplay.detail.stats')}</SectionLabel>
      <div className="px-5">
        <CardGroup>
          <CardRow
            icon={<Flame size={20} strokeWidth={1.8} color="var(--status-overdue)" />}
            label={t('streakDisplay.detail.currentStreak')}
            trailing={<StatValue value={streak} />}
          />
          <CardRow
            icon={<Trophy size={20} strokeWidth={1.8} color="var(--fg-3)" />}
            label={t('streakDisplay.detail.longestStreak')}
            trailing={<StatValue value={longestStreak} />}
          />
          <CardRow
            icon={<Medal size={20} strokeWidth={1.8} color="var(--fg-3)" />}
            label={t(getStreakTierLabelKey(streak))}
            trailing={
              <span
                className="block rounded-full"
                style={{ width: 8, height: 8, background: 'var(--primary)' }}
              />
            }
          />
        </CardGroup>
      </div>

      <SectionLabel>{t('streakDisplay.freeze.title')}</SectionLabel>

      {isPro ? (
        <>
          <div className="px-5">
            <p className="t-secondary" style={{ marginBottom: 14 }}>
              {t('streakDisplay.freeze.auto.explainer')}
            </p>
            <CardGroup>
              <CardRow
                icon={<Snowflake size={20} strokeWidth={1.8} color="var(--status-frozen)" />}
                label={t('streakDisplay.freeze.banked.label')}
                trailing={
                  <>
                    <ChargeGauge
                      banked={streakFreezesAccumulated}
                      max={maxStreakFreezesAccumulated}
                    />
                    <StatValue
                      value={`${streakFreezesAccumulated}/${maxStreakFreezesAccumulated}`}
                    />
                  </>
                }
              />
              <CardRow
                icon={<CalendarDays size={20} strokeWidth={1.8} color="var(--fg-3)" />}
                label={t('streakDisplay.freeze.usedThisMonth.label')}
                trailing={
                  <StatValue value={`${freezesUsedThisMonth}/${maxFreezesPerMonth}`} />
                }
              />
              <CardRow
                icon={<Clock size={20} strokeWidth={1.8} color="var(--fg-3)" />}
                label={t('streakDisplay.freeze.nextFreeze.label')}
                trailing={
                  <StatValue
                    value={
                      isBankedFull
                        ? t('streakDisplay.freeze.nextFreeze.full')
                        : t('streakDisplay.freeze.nextFreeze.inDays', {
                            days: nextFreezeDays,
                          })
                    }
                  />
                }
              />
            </CardGroup>
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
              <p className="t-secondary">
                {t('streakDisplay.freeze.protected.empty')}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="px-5" style={{ paddingBottom: 14 }}>
          <CardGroup>
            <CardRow
              icon={<Snowflake size={20} strokeWidth={1.8} color="var(--status-frozen)" />}
              label={t('streakDisplay.freeze.pro.gate')}
              trailing={
                <a
                  href="/upgrade"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--primary)',
                  }}
                >
                  {t('common.upgrade')}
                </a>
              }
            />
          </CardGroup>
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
