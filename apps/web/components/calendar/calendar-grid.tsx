'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { buildCalendarMonthModel, formatAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { DayCellWords, DayOutcome } from '@orbit/shared/contracts/dates'
import { useProfile } from '@/hooks/use-profile'
import { useDateFormat } from '@/hooks/use-date-format'
import { DayCell } from '@/components/dates/day-cell'
import { MonthGrid } from '@/components/dates/month-grid'

interface CalendarGridProps {
  currentMonth: Date
  dayMap: Map<string, CalendarDayEntry[]>
  onSelectDay: (dateStr: string) => void
  selectedDateStr?: string | null
  rangeStart?: string | null
  rangeEnd?: string | null
  isLoading?: boolean
}

function earliestLoggableDate(): string {
  const earliest = new Date()
  earliest.setDate(earliest.getDate() - 6)
  return formatAPIDate(earliest)
}

function isInRange(dateStr: string, rangeStart: string | null, rangeEnd: string | null): boolean {
  if (!rangeStart || !rangeEnd) return false
  const start = rangeStart < rangeEnd ? rangeStart : rangeEnd
  const end = rangeStart < rangeEnd ? rangeEnd : rangeStart
  return dateStr >= start && dateStr <= end
}

export function CalendarGrid({
  currentMonth,
  dayMap,
  onSelectDay,
  selectedDateStr = null,
  rangeStart = null,
  rangeEnd = null,
  isLoading = false,
}: Readonly<CalendarGridProps>) {
  const t = useTranslations()
  const { displayWeekdayDate, displayMonthYear } = useDateFormat()
  const { profile } = useProfile()
  const weekStartsOn: 0 | 1 = profile?.weekStartDay ?? 1
  const todayKey = formatAPIDate(new Date())
  const earliestKey = earliestLoggableDate()

  const weekdayLabels = useMemo(() => {
    const mondayFirst = [
      t('dates.daysShort.monday'),
      t('dates.daysShort.tuesday'),
      t('dates.daysShort.wednesday'),
      t('dates.daysShort.thursday'),
      t('dates.daysShort.friday'),
      t('dates.daysShort.saturday'),
      t('dates.daysShort.sunday'),
    ]
    return weekStartsOn === 0 ? [mondayFirst[6]!, ...mondayFirst.slice(0, 6)] : mondayFirst
  }, [t, weekStartsOn])

  const { gridDays } = useMemo(
    () => buildCalendarMonthModel(currentMonth, dayMap, weekStartsOn),
    [currentMonth, dayMap, weekStartsOn],
  )

  const words: DayCellWords = {
    none: t('calendar.dayCell.none'),
    partial: t('calendar.dayCell.partial'),
    full: t('calendar.dayCell.full'),
    notScheduled: t('calendar.dayCell.notScheduled'),
    future: t('calendar.dayCell.future'),
    of: t('calendar.dayCell.of'),
    today: t('calendar.dayCell.today'),
    selected: t('calendar.dayCell.selected'),
    readOnly: t('calendar.dayCell.readOnly'),
  }

  return (
    <div data-tour="tour-calendar-grid" style={{ padding: '16px 16px 8px' }}>
      <div style={{ borderRadius: 20, padding: 16, background: 'var(--bg-card)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
        <MonthGrid weekdayLabels={weekdayLabels} label={displayMonthYear(currentMonth)}>
          {gridDays.map((cell, index) => {
            const future = cell.dateStr > todayKey
            const loggable = cell.isCurrentMonth && !future && cell.dateStr >= earliestKey
            const outcome: DayOutcome | undefined = future ? 'future' : undefined
            const selected = cell.isCurrentMonth && (
              cell.dateStr === selectedDateStr ||
              cell.dateStr === rangeStart ||
              cell.dateStr === rangeEnd
            )
            const inRange = cell.isCurrentMonth && isInRange(cell.dateStr, rangeStart, rangeEnd)
            const dayCell = {
              day: cell.day,
              done: isLoading ? undefined : cell.completedCount,
              scheduled: isLoading ? undefined : cell.totalCount,
              today: cell.isToday,
              selected,
              outsideMonth: !cell.isCurrentMonth,
              label: displayWeekdayDate(cell.date, true),
              words,
            }
            return (
              <span
                key={cell.dateStr}
                data-in-range={inRange ? 'true' : undefined}
                data-tour={index === 0 ? 'tour-calendar-day' : undefined}
                style={{ borderRadius: 999, background: inRange ? 'var(--selection-bg)' : 'transparent' }}
              >
                {loggable ? (
                  <DayCell {...dayCell} loggable onPress={() => onSelectDay(cell.dateStr)} />
                ) : (
                  <DayCell {...dayCell} outcome={outcome} />
                )}
              </span>
            )
          })}
        </MonthGrid>
      </div>
    </div>
  )
}
