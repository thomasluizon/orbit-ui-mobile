'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  buildCalendarMonthModel,
  buildDayCellAccessibleName,
  formatAPIDate,
  resolveDayCellOutcome,
} from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { DayCellWords, DayOutcome, ReadOnlyDayCellProps } from '@orbit/shared/contracts/dates'
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
    <div data-testid="calendar-grid" data-tour="tour-calendar-grid" style={{ padding: '16px 4px 8px' }}>
      <div data-testid="calendar-grid-card" style={{ borderRadius: 20, padding: 0, background: 'var(--bg-card)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
        <MonthGrid weekdayLabels={weekdayLabels} gap={0} label={displayMonthYear(currentMonth)}>
          {gridDays.map((cell, index) => {
            const future = cell.dateStr > todayKey
            const outcome: DayOutcome | undefined = future ? 'future' : undefined
            const selected = cell.isCurrentMonth && (
              cell.dateStr === selectedDateStr ||
              cell.dateStr === rangeStart ||
              cell.dateStr === rangeEnd
            )
            const inRange = cell.isCurrentMonth && isInRange(cell.dateStr, rangeStart, rangeEnd)
            const dayCell: ReadOnlyDayCellProps = {
              day: cell.day,
              done: cell.completedCount,
              scheduled: cell.totalCount,
              today: cell.isToday,
              selected,
              outsideMonth: !cell.isCurrentMonth,
              outcome,
              label: displayWeekdayDate(cell.date, true),
              words,
            }
            const resolvedOutcome = resolveDayCellOutcome(dayCell)
            return (
              <span
                key={cell.dateStr}
                data-in-range={inRange ? 'true' : undefined}
                data-tour={index === 0 ? 'tour-calendar-day' : undefined}
                style={{ position: 'relative', width: 44, height: 44, borderRadius: 999, background: inRange ? 'var(--selection-bg)' : 'transparent' }}
              >
                {isLoading ? (
                  <span
                    aria-hidden="true"
                    data-testid="calendar-day-skeleton"
                    style={{ display: 'block', width: 44, height: 44, borderRadius: 999, background: 'var(--bg-well)', opacity: cell.isCurrentMonth ? 1 : 0 }}
                  />
                ) : (
                  <>
                    <span aria-hidden="true">
                      <DayCell {...dayCell} />
                    </span>
                    {cell.isCurrentMonth ? (
                      <button
                        type="button"
                        aria-current={cell.isToday ? 'date' : undefined}
                        aria-label={buildDayCellAccessibleName(dayCell, resolvedOutcome, false)}
                        aria-pressed={selected}
                        data-calendar-date={cell.dateStr}
                        onClick={() => onSelectDay(cell.dateStr)}
                        className="absolute inset-0 rounded-full border-0 bg-transparent p-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                      />
                    ) : null}
                  </>
                )}
              </span>
            )
          })}
        </MonthGrid>
      </div>
    </div>
  )
}
