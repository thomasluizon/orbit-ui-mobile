'use client'

import { useTranslations } from 'next-intl'
import type { CalendarRangeModel } from '@orbit/shared/utils'
import { DayCell } from '@/components/dates/day-cell'
import { MonthGrid } from '@/components/dates/month-grid'
import { PillButton } from '@/components/ui/pill-button'
import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { useDateFormat } from '@/hooks/use-date-format'
import { CalendarStats, type CalendarStat } from './calendar-stats'

interface CalendarRangeViewProps {
  model: CalendarRangeModel
  weekdayLabels: readonly string[]
  rangeLabel: string
  previousRangeLabel: string
  nextRangeLabel: string
  onPreviousRange: () => void
  onNextRange: () => void
  nextRangeDisabled: boolean
  stats: readonly CalendarStat[]
}

/** A fixed fourteen-day, read-only orientation view with span-level figures. */
export function CalendarRangeView({
  model,
  weekdayLabels,
  rangeLabel,
  previousRangeLabel,
  nextRangeLabel,
  onPreviousRange,
  onNextRange,
  nextRangeDisabled,
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

  return (
    <section
      aria-label={rangeLabel}
      className="flex flex-col"
      style={{ gap: 16, maxWidth: 420, padding: '12px 4px 24px' }}
    >
      <div className="flex items-center" style={{ gap: 8 }}>
        <p
          className="min-w-0 flex-1"
          style={{
            color: 'var(--fg-2)',
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {rangeLabel}
        </p>
        <PillButton
          variant="ghost"
          size="sm"
          iconOnly
          label={previousRangeLabel}
          onClick={onPreviousRange}
        >
          <ChevronLeft size={20} strokeWidth={1.8} aria-hidden="true" />
        </PillButton>
        <PillButton
          variant="ghost"
          size="sm"
          iconOnly
          label={nextRangeLabel}
          onClick={onNextRange}
          disabled={nextRangeDisabled}
        >
          <ChevronRight size={20} strokeWidth={1.8} aria-hidden="true" />
        </PillButton>
      </div>

      <MonthGrid weekdayLabels={[...weekdayLabels]} gap={4} label={rangeLabel}>
        {Array.from({ length: model.leadingEmptyDays }, (_, index) => (
          <span key={`leading-${index}`} aria-hidden="true" style={{ width: 44, height: 44 }} />
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
      </MonthGrid>

      <CalendarStats stats={stats} />
    </section>
  )
}
