'use client'

import type { Locale } from 'date-fns'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { CalendarGrid } from './calendar-grid'
import { CalendarTimeGrid, type TimeGridColumn } from './calendar-time-grid'

interface CalendarRangeViewProps {
  /** Month shown in the mini-calendar range picker. */
  currentMonth: Date
  /** Month-scoped entries powering the mini-calendar's status dots. */
  monthDayMap: Map<string, CalendarDayEntry[]>
  rangeStart: string
  rangeEnd: string
  onPickDay: (dateStr: string) => void
  columns: ReadonlyArray<TimeGridColumn>
  /** Range-scoped entries powering the time grid. */
  rangeDayMap: Map<string, CalendarDayEntry[]>
  hint: string
  onSelectDay: (dateStr: string) => void
  displayTime: (time: string) => string
  dateFnsLocale: Locale
  allDayLabel: string
  nowLabel: string
}

/** Custom-range view: a mini-calendar to pick a contiguous range, then the same
 *  time grid rendered with one column per day in that range. */
export function CalendarRangeView({
  currentMonth,
  monthDayMap,
  rangeStart,
  rangeEnd,
  onPickDay,
  columns,
  rangeDayMap,
  hint,
  onSelectDay,
  displayTime,
  dateFnsLocale,
  allDayLabel,
  nowLabel,
}: Readonly<CalendarRangeViewProps>) {
  return (
    <>
      <CalendarGrid
        currentMonth={currentMonth}
        dayMap={monthDayMap}
        onSelectDay={onPickDay}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
      />
      <p
        className="text-center"
        style={{
          margin: 0,
          padding: '0 24px 4px',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          color: 'var(--fg-3)',
        }}
      >
        {hint}
      </p>
      <CalendarTimeGrid
        columns={columns}
        dayMap={rangeDayMap}
        onSelectDay={onSelectDay}
        displayTime={displayTime}
        dateFnsLocale={dateFnsLocale}
        allDayLabel={allDayLabel}
        nowLabel={nowLabel}
      />
    </>
  )
}
