'use client'

import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'

import { useTranslations } from 'next-intl'
import type { CalendarRangeModel } from '@orbit/shared/utils'
import { DayCell } from '@/components/dates/day-cell'
import { MonthGrid } from '@/components/dates/month-grid'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { useDateFormat } from '@/hooks/use-date-format'
import { CalendarStats, type CalendarStat } from './calendar-stats'

interface CalendarRangeNavigationProps {
  rangeLabel: string
  previousRangeLabel: string
  nextRangeLabel: string
  onPreviousRange: () => void
  onNextRange: () => void
  nextRangeDisabled: boolean
}

export function CalendarRangeNavigation({ rangeLabel, previousRangeLabel, nextRangeLabel, onPreviousRange, onNextRange, nextRangeDisabled }: Readonly<CalendarRangeNavigationProps>) {
  return (
    <div data-testid="calendar-range-navigation" className="flex min-h-12 flex-wrap items-start justify-end gap-3">
      <p
        className="flex min-h-12 min-w-0 flex-auto items-center"
        style={{
          color: 'var(--fg-2)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875rem',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rangeLabel}
      </p>
      <div className="flex shrink-0 gap-3">
        <button type="button" aria-label={previousRangeLabel} onClick={onPreviousRange}
          className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full border-0 bg-transparent shadow-[inset_0_0_0_1.5px_var(--hairline-strong)] text-[var(--fg-2)] cursor-pointer transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg-1)] disabled:opacity-40">
          <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <button type="button" aria-label={nextRangeLabel} onClick={onNextRange} disabled={nextRangeDisabled}
          className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full border-0 bg-transparent shadow-[inset_0_0_0_1.5px_var(--hairline-strong)] text-[var(--fg-2)] cursor-pointer transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg-1)] disabled:opacity-40">
          <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

interface CalendarRangeViewProps {
  model: CalendarRangeModel
  weekdayLabels: readonly string[]
  rangeLabel: string
  isLoading: boolean
  loadingLabel: string
  stats: readonly [CalendarStat, CalendarStat, CalendarStat]
}

/** A fixed fourteen-day, read-only orientation view with span-level figures. */
export function CalendarRangeView({
  model,
  weekdayLabels,
  rangeLabel,
  isLoading,
  loadingLabel,
  stats,
}: Readonly<CalendarRangeViewProps>) {
  const t = useTranslations()
  const { displayWeekdayDate } = useDateFormat()
  const words = {
    none: t('calendar.dayCell.none'),
    partial: t('calendar.dayCell.partial'),
    full: t('calendar.dayCell.full'),
    notScheduled: t('calendar.dayCell.notScheduled'),
    of: t('calendar.dayCell.of'),
    today: t('calendar.dayCell.today'),
    readOnly: t('calendar.dayCell.readOnly'),
  }
  const gridCellCount = model.leadingEmptyDays + model.days.length

  return (
    <section
      aria-label={rangeLabel}
      aria-busy={isLoading}
      className="flex flex-col"
      style={{ gap: 16, padding: '0 0 24px' }}
    >
      {isLoading ? (
        <>
          <div className="orbit-calendar-grid-frame" style={{ paddingInline: 16 }}><div className="orbit-calendar-grid-card"><MonthGrid weekdayLabels={[...weekdayLabels]} gap="var(--calendar-grid-gap)" label={rangeLabel}>
            {Array.from({ length: gridCellCount }, (_, index) => (
              <span key={index} style={{ width: '100%', minHeight: MONTH_GRID_TARGET_MIN }}>
                {index === 0 ? (
                  <Skeleton variant="grid" rows={1} cols={1} cell={MONTH_GRID_TARGET_MIN} gap={0} label={loadingLabel} />
                ) : (
                  <Skeleton variant="grid" rows={1} cols={1} cell={MONTH_GRID_TARGET_MIN} gap={0} grouped />
                )}
              </span>
            ))}
          </MonthGrid></div></div>
          <CalendarStats stats={stats} state="loading" loadingLabel={loadingLabel} />
        </>
      ) : (
        <>
          <div className="orbit-calendar-grid-frame" style={{ paddingInline: 16 }}><div className="orbit-calendar-grid-card"><MonthGrid weekdayLabels={[...weekdayLabels]} gap="var(--calendar-grid-gap)" label={rangeLabel}>
            {Array.from({ length: model.leadingEmptyDays }, (_, index) => (
              <span key={`leading-${index}`} aria-hidden="true" style={{ width: '100%', minHeight: MONTH_GRID_TARGET_MIN }} />
            ))}
            {model.days.map((day) => (
              <DayCell
                key={day.dateStr}
                day={day.day}
                done={day.completedCount}
                scheduled={day.totalCount}
                today={day.isToday}
                label={displayWeekdayDate(day.date, true)}
                words={words}
              />
            ))}
          </MonthGrid></div></div>

          <CalendarStats stats={stats} />
        </>
      )}
    </section>
  )
}
