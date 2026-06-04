'use client'

import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'

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

export function StreakTimelineCard({
  t,
  weekDays,
}: Readonly<StreakTimelineCardProps>) {
  return (
    <div>
      <SectionLabel>{t('streakDisplay.detail.thisWeek')}</SectionLabel>
      <div className="px-5">
        <div
          className="overflow-hidden"
          style={{
            background: 'var(--bg-elev)',
            border: '1px solid var(--hairline)',
            borderRadius: 12,
            padding: '14px 12px 12px',
          }}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 6,
              marginBottom: 10,
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
            style={{ gap: 16, paddingTop: 6 }}
          >
            <LegendItem>
              <span aria-hidden="true" className="rounded-full" style={{ width: 6, height: 6, background: 'var(--fg-1)' }} />
              <span>{t('streakDisplay.detail.dayActive')}</span>
            </LegendItem>
            <LegendItem>
              <span aria-hidden="true" className="rounded-full" style={{ width: 6, height: 6, background: 'var(--status-frozen)' }} />
              <span>{t('streakDisplay.detail.dayFrozen')}</span>
            </LegendItem>
            <LegendItem>
              <span aria-hidden="true" className="rounded-full" style={{ width: 6, height: 6, boxShadow: 'inset 0 0 0 1.2px var(--fg-4)' }} />
              <span>{t('streakDisplay.detail.dayMissed')}</span>
            </LegendItem>
          </div>
        </div>
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
        <SettingsGroup>
          <SettingsGroupRow
            label={t('streakDisplay.detail.currentStreak')}
            trailing={<StatValue value={streak} />}
          />
          <SettingsGroupRow
            label={t('streakDisplay.detail.longestStreak')}
            trailing={<StatValue value={longestStreak} />}
          />
        </SettingsGroup>
      </div>

      <SectionLabel
        trailing={
          <span className="t-eyebrow" style={{ color: 'var(--status-frozen)' }}>
            {t('streakDisplay.freeze.auto.chip')}
          </span>
        }
      >
        {t('streakDisplay.freeze.title')}
      </SectionLabel>

      {isPro ? (
        <>
          <div className="px-5">
            <p className="t-secondary" style={{ marginBottom: 14 }}>
              {t('streakDisplay.freeze.auto.explainer')}
            </p>
            <SettingsGroup>
              <SettingsGroupRow
                label={t('streakDisplay.freeze.banked.label')}
                trailing={
                  <span className="flex items-center" style={{ gap: 10 }}>
                    <ChargeGauge
                      banked={streakFreezesAccumulated}
                      max={maxStreakFreezesAccumulated}
                    />
                    <StatValue
                      value={`${streakFreezesAccumulated}/${maxStreakFreezesAccumulated}`}
                    />
                  </span>
                }
              />
              <SettingsGroupRow
                label={t('streakDisplay.freeze.usedThisMonth.label')}
                trailing={
                  <StatValue value={`${freezesUsedThisMonth}/${maxFreezesPerMonth}`} />
                }
              />
              <SettingsGroupRow
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
            </SettingsGroup>
          </div>

          <SectionLabel>{t('streakDisplay.freeze.protected.label')}</SectionLabel>
          <div className="px-5" style={{ paddingBottom: 14 }}>
            {isFrozenToday || protectedDates.length > 0 ? (
              <SettingsGroup>
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
              </SettingsGroup>
            ) : (
              <p className="t-secondary">
                {t('streakDisplay.freeze.protected.empty')}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="px-5" style={{ paddingBottom: 14 }}>
          <SettingsGroup>
            <SettingsGroupRow
              label={t('streakDisplay.freeze.pro.gate')}
              trailing={
                <a
                  href="/upgrade"
                  className="t-secondary"
                  style={{ color: 'var(--primary)' }}
                >
                  {t('common.upgrade')}
                </a>
              }
            />
          </SettingsGroup>
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
    <SettingsGroupRow
      label={label}
      icon={
        <span
          className="block rounded-full"
          style={{ width: 8, height: 8, background: 'var(--status-frozen)' }}
        />
      }
      trailing={value ? <StatValue value={value} /> : undefined}
    />
  )
}

function StatValue({ value }: Readonly<{ value: number | string }>) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-family-mono)',
        fontSize: 13,
        color: 'var(--fg-3)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </span>
  )
}
