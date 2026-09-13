'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  buildCalendarMonthModel,
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
  isFirst: boolean
  isLoading: boolean
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
  isLoading,
  onSelectDay,
  selected,
  today,
}: Readonly<{
  accessibleName: string
  cell: CalendarMonthDay
  dayCell: ReadOnlyDayCellProps
  future: boolean
  isLoading: boolean
  onSelectDay: (dateStr: string) => void
  selected: boolean
  today: boolean
}>) {
  if (isLoading) {
    return (
      <span
        aria-hidden="true"
        data-testid="calendar-day-skeleton"
        style={{ display: 'block', width: 44, height: 44, borderRadius: 999, background: 'var(--bg-well)', opacity: cell.isCurrentMonth ? 1 : 0 }}
      />
    )
  }
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
          className="absolute inset-0 rounded-full border-0 bg-transparent p-0 cursor-pointer transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        />
      ) : null}
    </>
  )
}

function CalendarGridDay({
  cell,
  future,
  inRange,
  isFirst,
  isLoading,
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
      data-tour={isFirst ? 'tour-calendar-day' : undefined}
      style={{
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        width: 44,
        height: 44,
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
        isLoading={isLoading}
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
  const { displayWeekdayDate, displayMonthYear } = useDateFormat()

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

  return (
    <div data-testid="calendar-grid" data-tour="tour-calendar-grid" style={{ padding: '16px 4px 8px' }}>
      <div data-testid="calendar-grid-card" style={{ borderRadius: 20, padding: 0, background: 'var(--bg-card)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
        <MonthGrid weekdayLabels={weekdayLabels} gap={0} label={displayMonthYear(currentMonth)}>
          {gridDays.map((cell, index) => {
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
                isFirst={index === 0}
                isLoading={isLoading}
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
