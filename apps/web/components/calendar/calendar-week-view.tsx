'use client'

import type { Locale } from 'date-fns'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { CalendarTimeGrid, type TimeGridColumn } from './calendar-time-grid'

interface CalendarWeekViewProps {
  columns: ReadonlyArray<TimeGridColumn>
  dayMap: Map<string, CalendarDayEntry[]>
  /** Direction of the last week-nav step, driving the grid's slide-in motion. */
  slideDirection: 'left' | 'right' | null
  isLoading?: boolean
  onSelectDay: (dateStr: string) => void
  displayTime: (time: string) => string
  dateFnsLocale: Locale
  allDayLabel: string
  nowLabel: string
  timeZone: string | null
}

/** Week view: a 7-column time grid with week-granularity navigation. */
export function CalendarWeekView({
  columns,
  dayMap,
  slideDirection,
  isLoading = false,
  onSelectDay,
  displayTime,
  dateFnsLocale,
  allDayLabel,
  nowLabel,
  timeZone,
}: Readonly<CalendarWeekViewProps>) {
  let slideClass = ''
  if (slideDirection === 'right') {
    slideClass = 'animate-slide-date-right'
  } else if (slideDirection === 'left') {
    slideClass = 'animate-slide-date-left'
  }

  return (
    <div key={columns[0]?.dateStr ?? 'week'} className={slideClass}>
      <CalendarTimeGrid
        columns={columns}
        dayMap={dayMap}
        onSelectDay={onSelectDay}
        displayTime={displayTime}
        dateFnsLocale={dateFnsLocale}
        allDayLabel={allDayLabel}
        nowLabel={nowLabel}
        timeZone={timeZone}
        isLoading={isLoading}
      />
    </div>
  )
}
