'use client'

import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  buildCalendarMonthModel,
  formatWeekdayLabels,
  buildDayCellAccessibleName,
  isCalendarDayLoggable,
  resolveDayCellOutcome,
  type CalendarMonthDay,
} from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import type { DayCellWords, ReadOnlyDayCellProps } from '@orbit/shared/contracts/dates'
import { useDateFormat } from '@/hooks/use-date-format'
import { DayCell } from '@/components/dates/day-cell'
import { MonthGrid } from '@/components/dates/month-grid'
import { Skeleton } from '@/components/ui/skeleton'

interface CalendarGridProps {
  currentMonth: Date
  dayMap: Map<string, CalendarDayEntry[]>
  onSelectDay: (dateStr: string) => void
  selectedDateStr?: string | null
  rangeStart?: string | null
  rangeEnd?: string | null
  isLoading?: boolean
  weekStartsOn: 0 | 1
  todayKey: string
  interaction?: 'write-window' | 'range-picker'
}

function isInRange(dateStr: string, rangeStart: string | null, rangeEnd: string | null): boolean {
  if (!rangeStart || !rangeEnd) return false
  const start = rangeStart < rangeEnd ? rangeStart : rangeEnd
  const end = rangeStart < rangeEnd ? rangeEnd : rangeStart
  return dateStr >= start && dateStr <= end
}

interface CalendarGridDayProps {
  cell: CalendarMonthDay
  future: boolean
  inRange: boolean
  onSelectDay: (dateStr: string) => void
  selected: boolean
  words: DayCellWords
  futureWord: string
  selectedWord: string
  label: string
  interaction: 'write-window' | 'range-picker'
  todayKey: string
}

type CalendarFutureDayProps = {
  accessibleName: string
  cell: CalendarMonthDay
}

function CalendarFutureNumeral({ cell }: Readonly<Pick<CalendarFutureDayProps, 'cell'>>) {
  return (
    <span
      aria-hidden="true"
      style={{
        color: 'var(--fg-2)',
        fontFamily: 'var(--font-mono)',
        fontSize: 14,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {cell.day}
    </span>
  )
}

function CalendarFutureDay(props: Readonly<CalendarFutureDayProps>) {
  return (
    <span role="img" aria-label={props.accessibleName} className="inline-flex size-11 items-center justify-center">
      <CalendarFutureNumeral cell={props.cell} />
    </span>
  )
}

function calendarDayBackground(selected: boolean, inRange: boolean, raised: boolean): string {
  if (selected || inRange) return 'var(--selection-bg)'
  return raised ? 'var(--bg-well)' : 'transparent'
}

function CalendarGridDayBody({
  accessibleName,
  cell,
  dayCell,
  future,
  onSelectDay,
  selected,
  today,
}: Readonly<{
  accessibleName: string
  cell: CalendarMonthDay
  dayCell: ReadOnlyDayCellProps
  future: boolean
  onSelectDay: (dateStr: string) => void
  selected: boolean
  today: boolean
}>) {
  const contents = future && cell.isCurrentMonth
    ? <CalendarFutureDay accessibleName={accessibleName} cell={cell} />
    : <DayCell {...dayCell} />
  return (
    <>
      <span aria-hidden="true">{contents}</span>
      {cell.isCurrentMonth ? (
        <button
          type="button"
          aria-current={today ? 'date' : undefined}
          aria-label={accessibleName}
          aria-pressed={selected}
          data-testid={`calendar-day-select-${cell.dateStr}`}
          onClick={() => onSelectDay(cell.dateStr)}
          className="absolute inset-0 rounded-full border-0 bg-transparent p-0 cursor-pointer transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        />
      ) : null}
    </>
  )
}

function CalendarGridDay({
  cell,
  future,
  inRange,
  onSelectDay,
  selected,
  words,
  futureWord,
  selectedWord,
  label,
  interaction,
  todayKey,
}: Readonly<CalendarGridDayProps>) {
  const writable = interaction === 'write-window'
    && cell.isCurrentMonth
    && isCalendarDayLoggable(cell.dateStr, todayKey)
  const today = cell.dateStr === todayKey
  const selectedLabel = selected ? `${label}, ${selectedWord}` : label
  const dayCellBase = {
    day: cell.day,
    done: cell.completedCount,
    scheduled: cell.totalCount,
    today,
    outsideMonth: !cell.isCurrentMonth,
    label: selectedLabel,
    words,
  }
  const dayCell: ReadOnlyDayCellProps = dayCellBase
  const resolvedOutcome = resolveDayCellOutcome(dayCell)
  const accessibleName = future
    ? `${selectedLabel}, ${futureWord}`
    : buildDayCellAccessibleName(dayCell, resolvedOutcome, !writable)
  const raised = writable

  return (
    <span
      data-calendar-date={cell.dateStr}
      data-in-range={inRange ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      style={{
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        width: '100%',
        minWidth: MONTH_GRID_TARGET_MIN,
        height: MONTH_GRID_TARGET_MIN,
        borderRadius: 999,
        background: calendarDayBackground(selected, inRange, raised),
        boxShadow: selected ? 'inset 0 0 0 2px var(--primary)' : 'none',
      }}
    >
      <CalendarGridDayBody
        accessibleName={accessibleName}
        cell={cell}
        dayCell={dayCell}
        future={future}
        onSelectDay={onSelectDay}
        selected={selected}
        today={today}
      />
    </span>
  )
}

export function CalendarGrid({
  currentMonth,
  dayMap,
  onSelectDay,
  selectedDateStr = null,
  rangeStart = null,
  rangeEnd = null,
  isLoading = false,
  weekStartsOn,
  todayKey,
  interaction = 'write-window',
}: Readonly<CalendarGridProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const { displayWeekdayDate, displayMonthYear } = useDateFormat()

  const weekdayLabels = useMemo(() => formatWeekdayLabels(locale, weekStartsOn), [locale, weekStartsOn])

  const { gridDays } = useMemo(
    () => buildCalendarMonthModel(currentMonth, dayMap, weekStartsOn, todayKey),
    [currentMonth, dayMap, weekStartsOn, todayKey],
  )

  const words: DayCellWords = {
    none: t('calendar.dayCell.none'),
    partial: t('calendar.dayCell.partial'),
    full: t('calendar.dayCell.full'),
    notScheduled: t('calendar.dayCell.notScheduled'),
    of: t('calendar.dayCell.of'),
    today: t('calendar.dayCell.today'),
    readOnly: t('calendar.dayCell.readOnly'),
  }

  if (isLoading) {
    return (
      <div data-testid="calendar-grid" className="orbit-calendar-grid-frame" style={{ padding: '16px 4px 8px' }}>
        <div data-testid="calendar-grid-card" className="orbit-calendar-grid-card">
          <div role="progressbar" aria-label={t('calendar.loading')} aria-busy="true" data-rows={Math.ceil(gridDays.length / 7)} data-cols={7}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(var(--month-grid-touch-min), 1fr))', gap: 'var(--calendar-grid-gap)' }}>
            {gridDays.map((cell) => <Skeleton key={cell.dateStr} variant="grid" rows={1} cols={1} cell={MONTH_GRID_TARGET_MIN} gap={0} grouped />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="calendar-grid"
      className="orbit-calendar-grid-frame" style={{ padding: '16px 4px 8px' }}
    >
      <div
        data-testid="calendar-grid-card"
        className="orbit-calendar-grid-card"
      >
        <MonthGrid
          weekdayLabels={weekdayLabels}
          gap="var(--calendar-grid-gap)"
          label={displayMonthYear(currentMonth)}
        >
          {gridDays.map((cell) => {
            const future = cell.dateStr > todayKey
            const selected = cell.isCurrentMonth && (
              cell.dateStr === selectedDateStr ||
              cell.dateStr === rangeStart ||
              cell.dateStr === rangeEnd
            )
            const inRange = cell.isCurrentMonth && isInRange(cell.dateStr, rangeStart, rangeEnd)
            return (
              <CalendarGridDay
                key={cell.dateStr}
                cell={cell}
                future={future}
                inRange={inRange}
                onSelectDay={onSelectDay}
                selected={selected}
                words={words}
                futureWord={t('calendar.dayCell.future')}
                selectedWord={t('calendar.dayCell.selected')}
                label={displayWeekdayDate(cell.date, true)}
                interaction={interaction}
                todayKey={todayKey}
              />
            )
          })}
        </MonthGrid>
      </div>
    </div>
  )
}
