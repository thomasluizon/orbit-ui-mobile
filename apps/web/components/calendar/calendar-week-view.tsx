'use client'

import type { Locale } from 'date-fns'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { CalendarWeekNav } from '@/app/(app)/calendar/_components/calendar-shell'
import { CalendarTimeGrid, type TimeGridColumn } from './calendar-time-grid'

interface CalendarWeekViewProps {
  columns: ReadonlyArray<TimeGridColumn>
  dayMap: Map<string, CalendarDayEntry[]>
  weekLabel: string
  previousWeekLabel: string
  nextWeekLabel: string
  currentWeekLabel: string
  onPreviousWeek: () => void
  onNextWeek: () => void
  onCurrentWeek: () => void
  onSelectDay: (dateStr: string) => void
  displayTime: (time: string) => string
  dateFnsLocale: Locale
  allDayLabel: string
  nowLabel: string
}

/** Week view: a 7-column time grid with week-granularity navigation. */
export function CalendarWeekView({
  columns,
  dayMap,
  weekLabel,
  previousWeekLabel,
  nextWeekLabel,
  currentWeekLabel,
  onPreviousWeek,
  onNextWeek,
  onCurrentWeek,
  onSelectDay,
  displayTime,
  dateFnsLocale,
  allDayLabel,
  nowLabel,
}: Readonly<CalendarWeekViewProps>) {
  return (
    <>
      <CalendarWeekNav
        weekLabel={weekLabel}
        previousWeekLabel={previousWeekLabel}
        nextWeekLabel={nextWeekLabel}
        currentWeekLabel={currentWeekLabel}
        onPreviousWeek={onPreviousWeek}
        onNextWeek={onNextWeek}
        onCurrentWeek={onCurrentWeek}
      />
      <CalendarTimeGrid
        columns={columns}
        dayMap={dayMap}
        onSelectDay={onSelectDay}
        displayTime={displayTime}
        dateFnsLocale={dateFnsLocale}
        allDayLabel={allDayLabel}
        nowLabel={nowLabel}
      />
    </>
  )
}
