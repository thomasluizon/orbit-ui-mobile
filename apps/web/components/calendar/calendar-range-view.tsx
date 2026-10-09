'use client'

import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'

import { useTranslations } from 'next-intl'
import type { CalendarRangeModel } from '@orbit/shared/utils'
import { DayCell } from '@/components/dates/day-cell'
import { MonthGrid } from '@/components/dates/month-grid'
import { Skeleton } from '@/components/ui/skeleton'
import { useDateFormat } from '@/hooks/use-date-format'
import { CalendarStats, type CalendarStat } from './calendar-stats'

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
