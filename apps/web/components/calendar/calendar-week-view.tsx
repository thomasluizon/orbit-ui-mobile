'use client'

import type { Locale } from 'date-fns'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { CalendarWeekNav } from '@/app/(app)/calendar/_components/calendar-shell'
import { ShowRecurringToggle } from './show-recurring-toggle'
import { CalendarTimeGrid, type TimeGridColumn } from './calendar-time-grid'

interface CalendarWeekViewProps {
  columns: ReadonlyArray<TimeGridColumn>
  dayMap: Map<string, CalendarDayEntry[]>
  weekLabel: string
  previousWeekLabel: string
  nextWeekLabel: string
  currentWeekLabel: string
  /** Direction of the last week-nav step, driving the grid's slide-in motion. */
  slideDirection: 'left' | 'right' | null
  isLoading?: boolean
  onPreviousWeek: () => void
  onNextWeek: () => void
  onCurrentWeek: () => void
  onSelectDay: (dateStr: string) => void
  displayTime: (time: string) => string
  dateFnsLocale: Locale
  allDayLabel: string
  nowLabel: string
  showRecurring: boolean
  onShowRecurringChange: (value: boolean) => void
}

/** Week view: a 7-column time grid with week-granularity navigation. */
export function CalendarWeekView({
  columns,
  dayMap,
  weekLabel,
  previousWeekLabel,
  nextWeekLabel,
  currentWeekLabel,
  slideDirection,
  isLoading = false,
  onPreviousWeek,
  onNextWeek,
  onCurrentWeek,
  onSelectDay,
  displayTime,
  dateFnsLocale,
  allDayLabel,
  nowLabel,
  showRecurring,
  onShowRecurringChange,
}: Readonly<CalendarWeekViewProps>) {
  let slideClass = ''
  if (slideDirection === 'right') {
    slideClass = 'animate-slide-date-right'
  } else if (slideDirection === 'left') {
    slideClass = 'animate-slide-date-left'
  }

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
      <div className="flex justify-end" style={{ padding: '0 20px 6px' }}>
        <ShowRecurringToggle
          checked={showRecurring}
          onChange={onShowRecurringChange}
        />
      </div>
      <div key={columns[0]?.dateStr ?? 'week'} className={slideClass}>
        <CalendarTimeGrid
          columns={columns}
          dayMap={dayMap}
          onSelectDay={onSelectDay}
          displayTime={displayTime}
          dateFnsLocale={dateFnsLocale}
          allDayLabel={allDayLabel}
          nowLabel={nowLabel}
          isLoading={isLoading}
        />
      </div>
    </>
  )
}
