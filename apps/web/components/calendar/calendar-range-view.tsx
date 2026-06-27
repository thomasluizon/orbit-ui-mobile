'use client'

import type { Locale } from 'date-fns'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { CalendarGrid } from './calendar-grid'
import { ShowRecurringToggle } from './show-recurring-toggle'
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
  /** Notice shown in place of the hint when the picked range was clamped to the
   *  maximum number of days. */
  clampedNotice: string
  isClamped: boolean
  onSelectDay: (dateStr: string) => void
  displayTime: (time: string) => string
  dateFnsLocale: Locale
  allDayLabel: string
  nowLabel: string
  showRecurring: boolean
  onShowRecurringChange: (value: boolean) => void
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
  clampedNotice,
  isClamped,
  onSelectDay,
  displayTime,
  dateFnsLocale,
  allDayLabel,
  nowLabel,
  showRecurring,
  onShowRecurringChange,
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
      <div
        className="flex items-center justify-between"
        style={{ gap: 12, padding: '0 20px 6px' }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: isClamped ? 'var(--status-overdue-text)' : 'var(--fg-3)',
          }}
        >
          {isClamped ? clampedNotice : hint}
        </p>
        <ShowRecurringToggle
          checked={showRecurring}
          onChange={onShowRecurringChange}
        />
      </div>
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
